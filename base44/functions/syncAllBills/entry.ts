import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DEFAULT_API_KEY = '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Map API statusType + recent actions to a human-readable status label.
 * Also checks action text for advanced/passed signals.
 */
function deriveStatusLabel(result) {
    const statusType = result.status?.statusType || '';
    const statusDesc = result.status?.statusDesc || '';
    const actions = result.actions?.items || [];

    // Check most recent actions first (reversed) for key legislative events
    const recentActions = [...actions].reverse();
    for (const action of recentActions) {
        const text = (action.text || '').toUpperCase();
        if (text.includes('SIGNED') || text.includes('CHAPTERED')) return 'Signed';
        if (text.includes('VETOED') || text.includes('POCKET VETO')) return 'Vetoed';
        if (text.includes('PASSED SENATE') && action.chamber === 'SENATE') return 'Passed Senate';
        if (text.includes('PASSED ASSEMBLY') && action.chamber === 'ASSEMBLY') return 'Passed Assembly';
        if (text.includes('SUBSTITUTED')) return 'Substituted';
        if (text.includes('ADVANCED TO THIRD READING') || text.includes('THIRD READING')) return 'Advanced to Third Reading';
    }

    // Fall back to statusType mapping
    const typeMap = {
        'SIGNED_BY_GOV': 'Signed',
        'VETOED': 'Vetoed',
        'PASSED_SENATE': 'Passed Senate',
        'PASSED_ASSEMBLY': 'Passed Assembly',
        'SENATE_FLOOR': 'Senate Floor Calendar',
        'ASSEMBLY_FLOOR': 'Assembly Floor Calendar',
        'IN_SENATE_COMM': 'In Senate Committee',
        'IN_ASSEMBLY_COMM': 'In Assembly Committee',
        'DELIVERED_TO_GOV': 'Delivered to Governor',
        'SUBSTITUTED': 'Substituted',
    };

    return typeMap[statusType] || statusDesc || null;
}

/**
 * Ensure a status label exists in the office's TrackerConfig bill_statuses.
 * If not, create/update the config to include it.
 */
async function ensureStatusTag(base44, officeId, label, officeStatusConfigCache) {
    const cached = officeStatusConfigCache[officeId];
    const existingItems = cached?.items || [];
    if (existingItems.find(i => i.label?.trim().toLowerCase() === label.trim().toLowerCase())) {
        return; // already exists
    }

    const newItems = [...existingItems, { label, color: 'Gray', sort_order: existingItems.length }];

    if (cached?.id) {
        await base44.asServiceRole.entities.TrackerConfig.update(cached.id, { items: newItems });
    } else {
        const created = await base44.asServiceRole.entities.TrackerConfig.create({
            office_id: officeId,
            config_type: 'bill_statuses',
            items: newItems,
        });
        officeStatusConfigCache[officeId] = created;
    }

    if (officeStatusConfigCache[officeId]) {
        officeStatusConfigCache[officeId].items = newItems;
    }
}

/**
 * Fetch Assembly bill data from NY Senate Open Legislation API.
 * - Uses Assembly bill number to get: title, assembly committee, current status, assembly sponsor
 * - Looks up Senate companion bill (sameAs) just to extract the senate sponsor name
 * - Returns update payload or null if nothing found
 */
async function fetchBillFromAPI(bill, apiKey) {
    const billNum = bill.bill_number?.trim().toUpperCase();
    if (!billNum || !/^[AS]\d+[A-Z]?/.test(billNum)) {
        throw new Error(`Invalid bill number: "${billNum}"`);
    }

    const key = apiKey || DEFAULT_API_KEY;

    // Try session years 2025 then 2026 (2025-2026 session bills are keyed under 2025 in the API)
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

    // Title — always overwrite from API
    if (result.title) {
        updateData.title = result.title;
    }

    // Assembly committee — from status.committeeName (this is the current active committee)
    if (result.status?.committeeName) {
        updateData.committee = [result.status.committeeName];
    } else {
        updateData.committee = [];
    }

    // Current status — derive a meaningful label from status type + action history
    const statusLabel = deriveStatusLabel(result);
    if (statusLabel) {
        updateData.latest_status = [statusLabel];
        updateData._derivedStatusLabel = statusLabel; // passed through for tag ensurance
    }

    // Assembly sponsor — from the bill's own sponsor field
    if (billNum.startsWith('A')) {
        const m = result.sponsor?.member;
        if (m) {
            const name = m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.shortName;
            if (name) updateData.assembly_sponsor = name;
        }
    } else {
        // Senate bill — sponsor goes to senate_sponsor
        const m = result.sponsor?.member;
        if (m) {
            const name = m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.shortName;
            if (name) updateData.senate_sponsor = name;
        }
    }

    // For Assembly bills: find Senate companion (sameAs) and grab ONLY their sponsor name
    if (billNum.startsWith('A')) {
        try {
            const amendments = result.amendments?.items || {};
            // Try latest amendment version first, then fall back to base version
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
        try {
            const body = await req.clone().json();
            officeId = body?.officeId || null;
        } catch { /* scheduled call — no body */ }

        let billsToSync = [];
        // Cache of { officeId -> TrackerConfig record } to avoid repeated fetches
        const officeStatusConfigCache = {};

        if (officeId) {
            const offices = await base44.asServiceRole.entities.Office.filter({ id: officeId });
            const apiKey = offices[0]?.senate_api_key || DEFAULT_API_KEY;
            const bills = await base44.asServiceRole.entities.Bill.filter({ office_id: officeId });
            billsToSync = bills.map(b => ({ ...b, _apiKey: apiKey }));
            // Pre-load status config for this office
            const configs = await base44.asServiceRole.entities.TrackerConfig.filter({ office_id: officeId, config_type: 'bill_statuses' });
            if (configs[0]) officeStatusConfigCache[officeId] = configs[0];
        } else {
            const offices = await base44.asServiceRole.entities.Office.list();
            for (const office of offices) {
                const apiKey = office.senate_api_key || DEFAULT_API_KEY;
                const bills = await base44.asServiceRole.entities.Bill.filter({ office_id: office.id });
                billsToSync.push(...bills.map(b => ({ ...b, _apiKey: apiKey })));
                // Pre-load status config for each office
                const configs = await base44.asServiceRole.entities.TrackerConfig.filter({ office_id: office.id, config_type: 'bill_statuses' });
                if (configs[0]) officeStatusConfigCache[office.id] = configs[0];
            }
        }

        console.log(`Starting sequential sync for ${billsToSync.length} bills`);

        let updated = 0;
        let errors = 0;
        let skipped = 0;

        for (const bill of billsToSync) {
            try {
                const updateData = await fetchBillFromAPI(bill, bill._apiKey);

                if (updateData) {
                    // Ensure the derived status label exists as a tag in TrackerConfig
                    if (updateData._derivedStatusLabel) {
                        await ensureStatusTag(base44, bill.office_id, updateData._derivedStatusLabel, officeStatusConfigCache);
                        delete updateData._derivedStatusLabel;
                    }
                    await sleep(300); // throttle SDK writes
                    await base44.asServiceRole.entities.Bill.update(bill.id, updateData);
                    console.log(`✓ ${bill.bill_number}: status=${JSON.stringify(updateData.latest_status)}, committee=${JSON.stringify(updateData.committee)}, assembly_sponsor="${updateData.assembly_sponsor || ''}", senate_sponsor="${updateData.senate_sponsor || ''}"`);
                    updated++;
                } else {
                    skipped++;
                    console.log(`- ${bill.bill_number}: not found in API, skipped`);
                }

                await sleep(200); // throttle Senate API requests
            } catch (err) {
                errors++;
                console.error(`✗ ${bill.bill_number}: ${err.message}`);
                if (err.message?.includes('Rate limit') || err.message?.includes('429')) {
                    await sleep(3000);
                }
            }
        }

        console.log(`Sync done: ${updated} updated, ${skipped} not found, ${errors} errors / ${billsToSync.length} total`);
        return Response.json({ success: true, updated, errors, skipped, total: billsToSync.length });

    } catch (error) {
        console.error('Sync failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});