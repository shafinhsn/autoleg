import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DEFAULT_API_KEY = '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch bill data from NY Senate Open Legislation API.
 * Only updates: title, latest_status, assembly_sponsor, senate_sponsor, linked_senate_bill
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

    // Title
    if (result.title) {
        updateData.title = result.title;
    }

    // Committee — always overwrite with what the API says (replaces any manually added tags)
    updateData.committee = result.status?.committeeName ? [result.status.committeeName] : [];

    // Status resolution — priority order (highest wins):
    // 1. statusType from the API's current status object (most authoritative)
    // 2. Action history scan (for statuses like "Ordered to Third Reading" not in statusType)
    const statusType = result.status?.statusType || '';
    const statusDesc = result.status?.statusDesc || '';

    // Direct statusType → label map (these are definitive — trust them over action history)
    const typeMap = {
        'SIGNED_BY_GOV': 'Signed',
        'VETOED': 'Vetoed',
        'DELIVERED_TO_GOV': 'Delivered to Governor',
        'PASSED_ASSEMBLY': 'Passed Assembly',
        'PASSED_SENATE': 'Passed Senate',
        'SENATE_FLOOR': 'Senate Floor Calendar',
        'ASSEMBLY_FLOOR': 'Assembly Floor Calendar',
        'IN_SENATE_COMM': 'In Senate Committee',
        'IN_ASSEMBLY_COMM': 'In Assembly Committee',
        // SUBSTITUTED is intentionally omitted — a substituted bill may have already passed
    };

    // Use statusType first if it's a definitive high-confidence status
    let statusLabel = typeMap[statusType] || null;

    // If statusType isn't in our map (e.g. SUBSTITUTED, or something unknown),
    // scan action history from most-recent to oldest to find the best status
    if (!statusLabel) {
        const actions = result.actions?.items || [];
        // Scan in reverse (newest action first) so the most recent event wins
        const reversedActions = [...actions].reverse();

        // Priority order: highest-priority match wins
        const actionPriority = [
            { test: (t) => t.includes('SIGNED') || t.includes('CHAPTERED'), label: 'Signed' },
            { test: (t) => t.includes('VETOED') || t.includes('POCKET VETO'), label: 'Vetoed' },
            { test: (t) => t.includes('DELIVERED TO GOV'), label: 'Delivered to Governor' },
            { test: (t) => t.includes('RETURNED TO SENATE') || t.includes('PASSED ASSEMBLY'), label: 'Passed Assembly' },
            { test: (t) => t.includes('PASSED SENATE'), label: 'Passed Senate' },
            { test: (t) => t.includes('SUBSTITUTED'), label: 'Substituted' },
            { test: (t) => t.includes('ORDERED TO THIRD READING') || t.includes('ADVANCED TO THIRD READING') || t.includes('THIRD READING CAL'), label: 'Ordered to Third Reading' },
        ];

        // Walk priority list top-down; for each priority level, check if ANY action (newest first) matches
        for (const priority of actionPriority) {
            const found = reversedActions.find(a => priority.test((a.text || '').toUpperCase()));
            if (found) { statusLabel = priority.label; break; }
        }
    }

    if (!statusLabel) statusLabel = statusDesc || null;

    if (statusLabel) {
        updateData.latest_status = [statusLabel];
    }

    // Assembly sponsor
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

    // For Assembly bills: find Senate companion sponsor name only
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

    return Object.keys(updateData).length > 0 ? updateData : null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        let officeId = null;
        let billIds = null; // optional: sync only specific bill IDs (for batching)
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
                    await base44.asServiceRole.entities.Bill.update(bill.id, updateData);
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