import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DEFAULT_API_KEY = '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Milestones that accumulate — we look for these in action history
const MILESTONE_TESTS = [
    { test: (t) => t.includes('PASSED ASSEMBLY') || t.includes('RETURNED TO SENATE'), label: 'Passed Assembly' },
    { test: (t) => t.includes('PASSED SENATE') && !t.includes('DELIVERED TO ASSEMBLY'), label: 'Passed Senate' },
    { test: (t) => t.includes('DELIVERED TO GOV'), label: 'Delivered to Governor' },
    { test: (t) => t.includes('SIGNED CHAP') || t.includes('APPROVED BY GOV') || t.includes('CHAPTERED'), label: 'Signed into Law' },
    { test: (t) => t.includes('VETOED') || t.includes('POCKET VETO'), label: 'Vetoed' },
];

// Procedural status — represents where the bill currently sits (single value)
const PROCEDURAL_STATUS_MAP = {
    'SIGNED_BY_GOV': 'Signed into Law',
    'VETOED': 'Vetoed',
    'DELIVERED_TO_GOV': 'On Governor\'s Desk',
    'PASSED_ASSEMBLY': 'Passed Assembly — Awaiting Senate',
    'PASSED_SENATE': 'Passed Senate — Awaiting Assembly',
    'SENATE_FLOOR': 'Senate Floor Calendar',
    'ASSEMBLY_FLOOR': 'Assembly Floor Calendar',
    'IN_SENATE_COMM': 'In Senate Committee',
    'IN_ASSEMBLY_COMM': 'In Assembly Committee',
    'SUBSTITUTED': 'Substituted',
};

/**
 * Derive current_procedural_status and milestones from API data.
 * NEVER touches: tags, notes, lobbyist, staff_assignees, or any user-controlled fields.
 */
async function fetchBillFromAPI(bill, apiKey) {
    const billNum = bill.bill_number?.trim().toUpperCase();
    if (!billNum || !/^[AS]\d+[A-Z]?/.test(billNum)) {
        throw new Error(`Invalid bill number: "${billNum}"`);
    }

    const key = apiKey || DEFAULT_API_KEY;

    let result = null;
    for (const year of [2025, 2026]) {
        const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${key}&view=with_refs`;
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.success && data.result) {
            result = data.result;
            break;
        }
    }

    if (!result) return null;

    const updateData = {};

    // --- Title ---
    if (result.title) updateData.title = result.title;

    // --- Committee (API-controlled) ---
    updateData.committee = result.status?.committeeName ? [result.status.committeeName] : [];

    // --- Sponsors ---
    if (billNum.startsWith('A')) {
        const m = result.sponsor?.member;
        if (m) {
            const name = m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.shortName;
            if (name) updateData.assembly_sponsor = name;
        }
    } else {
        const m = result.sponsor?.member;
        if (m) {
            const name = m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.shortName;
            if (name) updateData.senate_sponsor = name;
        }
    }

    // --- Senate companion (for Assembly bills) ---
    if (billNum.startsWith('A')) {
        try {
            const amendments = result.amendments?.items || {};
            const versionKeys = Object.keys(amendments).sort().reverse();
            let senateBillNum = null;
            let senateBillSession = null;
            for (const vKey of versionKeys) {
                const sameAsItems = amendments[vKey]?.sameAs?.items || [];
                const companion = sameAsItems.find(x => (x.basePrintNo || x.printNo || '').startsWith('S'));
                if (companion) {
                    senateBillNum = companion.basePrintNo || companion.printNo;
                    senateBillSession = companion.session || 2025;
                    break;
                }
            }
            if (senateBillNum) {
                updateData.linked_senate_bill = senateBillNum;
                const sUrl = `https://legislation.nysenate.gov/api/3/bills/${senateBillSession}/${senateBillNum}?key=${key}`;
                const sResp = await fetch(sUrl);
                if (sResp.ok) {
                    const sData = await sResp.json();
                    const sm = sData?.result?.sponsor?.member;
                    if (sm) {
                        const sname = sm.fullName || `${sm.firstName || ''} ${sm.lastName || ''}`.trim() || sm.shortName;
                        if (sname) updateData.senate_sponsor = sname;
                    }
                }
            }
        } catch (e) {
            console.error(`${billNum} senate companion lookup failed: ${e.message}`);
        }
    }

    // --- Action history ---
    const actions = result.actions?.items || [];
    const actionTexts = actions.map(a => (a.text || '').toUpperCase());

    // MILESTONES: scan full action history — accumulate all that apply
    const foundMilestones = [];
    for (const m of MILESTONE_TESTS) {
        if (actionTexts.some(t => m.test(t))) {
            foundMilestones.push(m.label);
        }
    }
    updateData.milestones = foundMilestones;

    // CURRENT PROCEDURAL STATUS: derive strictly from the milestones achieved + statusType.
    // The most advanced milestone determines the procedural context, preventing contradictions
    // like "Awaiting Assembly Action" when "Passed Assembly" is already a milestone.
    const substitutedBy = result.substitutedBy;
    if (substitutedBy?.basePrintNo) {
        const compBillNo = substitutedBy.basePrintNo;
        const compSession = substitutedBy.session || 2025;
        let compStatus = null;
        try {
            const compUrl = `https://legislation.nysenate.gov/api/3/bills/${compSession}/${compBillNo}?key=${key}`;
            const compResp = await fetch(compUrl);
            if (compResp.ok) {
                const compData = await compResp.json();
                const cs = compData?.result?.status;
                if (cs) {
                    compStatus = PROCEDURAL_STATUS_MAP[cs.statusType] || cs.statusDesc || null;
                }
            }
        } catch (e) {
            console.error(`${billNum} companion status lookup failed: ${e.message}`);
        }
        updateData.current_procedural_status = compStatus || 'Substituted';
    } else {
        const statusType = result.status?.statusType || '';
        const committeeName = result.status?.committeeName || '';

        // Terminal states from action history take highest priority
        const reversedActions = [...actions].reverse();
        let proceduralStatus = null;

        if (reversedActions.some(a => { const t = (a.text||'').toUpperCase(); return t.includes('SIGNED CHAP') || t.includes('APPROVED BY GOV') || t.includes('CHAPTERED'); })) {
            proceduralStatus = 'Signed into Law';
        } else if (reversedActions.some(a => { const t = (a.text||'').toUpperCase(); return t.includes('VETOED') || t.includes('POCKET VETO'); })) {
            proceduralStatus = 'Vetoed';
        } else if (reversedActions.some(a => (a.text||'').toUpperCase().includes('DELIVERED TO GOV'))) {
            proceduralStatus = 'On Governor\'s Desk';
        } else {
            // Use milestones to prevent contradictions:
            // If both chambers passed, it must be going to Governor or is done
            const passedAssembly = foundMilestones.includes('Passed Assembly');
            const passedSenate = foundMilestones.includes('Passed Senate');

            if (passedAssembly && passedSenate) {
                // Both passed — heading to governor (or waiting for enrollment)
                proceduralStatus = 'Passed Both Chambers — Awaiting Governor';
            } else if (passedAssembly && !passedSenate) {
                // Passed Assembly, now in Senate
                proceduralStatus = committeeName
                    ? `Passed Assembly — In Senate ${committeeName} Committee`
                    : 'Passed Assembly — In Senate';
            } else if (passedSenate && !passedAssembly) {
                // Passed Senate, now in Assembly
                proceduralStatus = committeeName
                    ? `Passed Senate — In Assembly ${committeeName} Committee`
                    : 'Passed Senate — In Assembly';
            } else {
                // Bill hasn't passed either chamber yet — use statusType + committee
                if (statusType === 'IN_SENATE_COMM' || statusType === 'SENATE_FLOOR') {
                    if (statusType === 'SENATE_FLOOR') {
                        const onThirdReading = reversedActions.some(a => {
                            const t = (a.text || '').toUpperCase();
                            return t.includes('THIRD READING') || t.includes('3RD READING') || t.includes('THIRD READ');
                        });
                        proceduralStatus = onThirdReading
                            ? 'Senate Floor Calendar — Third Reading'
                            : 'Senate Floor Calendar';
                    } else {
                        proceduralStatus = committeeName
                            ? `In Senate ${committeeName} Committee`
                            : 'In Senate Committee';
                    }
                } else if (statusType === 'IN_ASSEMBLY_COMM' || statusType === 'ASSEMBLY_FLOOR') {
                    if (statusType === 'ASSEMBLY_FLOOR') {
                        // Check if bill is on Third Reading in the action history
                        const onThirdReading = reversedActions.some(a => {
                            const t = (a.text || '').toUpperCase();
                            return t.includes('THIRD READING') || t.includes('3RD READING') || t.includes('THIRD READ');
                        });
                        proceduralStatus = onThirdReading
                            ? 'Assembly Floor Calendar — Third Reading'
                            : 'Assembly Floor Calendar';
                    } else {
                        proceduralStatus = committeeName
                            ? `In Assembly ${committeeName} Committee`
                            : 'In Assembly Committee';
                    }
                } else {
                    proceduralStatus = PROCEDURAL_STATUS_MAP[statusType] || result.status?.statusDesc || null;
                }
            }
        }

        if (proceduralStatus) updateData.current_procedural_status = proceduralStatus;
    }

    // Also keep latest_status in sync for backwards compatibility
    if (updateData.current_procedural_status) {
        updateData.latest_status = [updateData.current_procedural_status];
    }

    console.log(`  ${billNum} | procedural: "${updateData.current_procedural_status}" | milestones: [${updateData.milestones?.join(', ')}]`);

    return Object.keys(updateData).length > 0 ? updateData : null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        let officeId = null;
        let billIds = null;
        try {
            const body = await req.clone().json();
            officeId = body?.officeId || null;
            billIds = body?.billIds || null;
        } catch { /* scheduled call — no body */ }

        let billsToSync = [];

        if (officeId) {
            const offices = await base44.asServiceRole.entities.Office.filter({ id: officeId });
            const apiKey = offices[0]?.senate_api_key || DEFAULT_API_KEY;
            const bills = await base44.asServiceRole.entities.Bill.filter({ office_id: officeId });
            const filtered = billIds ? bills.filter(b => billIds.includes(b.id)) : bills;
            billsToSync = filtered.map(b => ({ ...b, _apiKey: apiKey }));
        } else {
            const offices = await base44.asServiceRole.entities.Office.list();
            for (const office of offices) {
                const apiKey = office.senate_api_key || DEFAULT_API_KEY;
                const bills = await base44.asServiceRole.entities.Bill.filter({ office_id: office.id });
                billsToSync.push(...bills.map(b => ({ ...b, _apiKey: apiKey })));
            }
        }

        console.log(`Starting sync for ${billsToSync.length} bills`);

        let updated = 0;
        let errors = 0;
        let skipped = 0;

        for (const bill of billsToSync) {
            try {
                const updateData = await fetchBillFromAPI(bill, bill._apiKey);

                if (updateData) {
                    await sleep(150);
                    // IMPORTANT: Only write API-controlled fields. Never touch tags, lobbyist,
                    // notes, staff_assignees, pc_contact, next_steps, session_comments, or google_drive_url.
                    const safeUpdate = {
                        title: updateData.title,
                        committee: updateData.committee,
                        assembly_sponsor: updateData.assembly_sponsor,
                        senate_sponsor: updateData.senate_sponsor,
                        linked_senate_bill: updateData.linked_senate_bill,
                        current_procedural_status: updateData.current_procedural_status,
                        milestones: updateData.milestones,
                        latest_status: updateData.latest_status,
                    };
                    // Remove undefined keys so we don't accidentally null out fields
                    Object.keys(safeUpdate).forEach(k => safeUpdate[k] === undefined && delete safeUpdate[k]);

                    await base44.asServiceRole.entities.Bill.update(bill.id, safeUpdate);
                    console.log(`✓ ${bill.bill_number}`);
                    updated++;
                } else {
                    skipped++;
                    console.log(`- ${bill.bill_number}: not found`);
                }

                await sleep(150);
            } catch (err) {
                errors++;
                console.error(`✗ ${bill.bill_number}: ${err.message}`);
                if (err.message?.includes('429')) {
                    await sleep(3000);
                }
            }
        }

        console.log(`Sync done: ${updated} updated, ${skipped} skipped, ${errors} errors / ${billsToSync.length} total`);
        return Response.json({ success: true, updated, errors, skipped, total: billsToSync.length });

    } catch (error) {
        console.error('Sync failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});