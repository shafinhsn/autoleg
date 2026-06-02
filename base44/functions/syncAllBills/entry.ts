import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Accept optional officeId from frontend calls; fall back to all offices for scheduled runs
        let officeId = null;
        try {
            const body = await req.clone().json();
            officeId = body?.officeId || null;
        } catch { /* no body or not JSON — scheduled call */ }

        let billsToSync = [];
        const DEFAULT_API_KEY = '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';

        if (officeId) {
            const offices = await base44.asServiceRole.entities.Office.filter({ id: officeId });
            const apiKey = offices[0]?.senate_api_key || DEFAULT_API_KEY;
            const bills = await base44.asServiceRole.entities.Bill.filter({ office_id: officeId });
            billsToSync = bills.map(b => ({ ...b, _apiKey: apiKey }));
        } else {
            const offices = await base44.asServiceRole.entities.Office.list();
            for (const office of offices) {
                const apiKey = office.senate_api_key || DEFAULT_API_KEY;
                const bills = await base44.asServiceRole.entities.Bill.filter({ office_id: office.id });
                billsToSync.push(...bills.map(b => ({ ...b, _apiKey: apiKey })));
            }
        }

        console.log(`Syncing ${billsToSync.length} bills`);
        let updated = 0;
        let errors = 0;

        for (const bill of billsToSync) {
            try {
                const updateData = await fetchBillUpdate(bill, bill._apiKey);
                if (updateData && Object.keys(updateData).length > 0) {
                    await base44.asServiceRole.entities.Bill.update(bill.id, updateData);
                    updated++;
                    console.log(`✓ ${bill.bill_number}: updated (committee=${updateData.committee}, status=${updateData.latest_status})`);
                } else {
                    console.log(`- ${bill.bill_number}: no changes`);
                }
            } catch (e) {
                errors++;
                console.error(`✗ ${bill.bill_number}: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        console.log(`Sync complete: ${updated} updated, ${errors} errors out of ${billsToSync.length}`);
        return Response.json({ success: true, updated, errors, total: billsToSync.length });
    } catch (error) {
        console.error('Sync failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

async function fetchBillUpdate(bill, apiKey) {
    const billNum = bill.bill_number?.trim().toUpperCase();
    if (!billNum || !/^[AS]\d+/.test(billNum)) {
        throw new Error(`Invalid bill number format: "${billNum}"`);
    }

    const year = bill.session_year || 2026;
    const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${apiKey}&view=with_refs`;

    const resp = await fetch(url);
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`API HTTP ${resp.status} for ${billNum}: ${text.slice(0, 120)}`);
    }

    const json = await resp.json();
    if (!json.success) {
        throw new Error(`API error for ${billNum}: ${json.message || 'unknown error'}`);
    }

    const result = json?.result;
    if (!result) throw new Error(`No result in API response for ${billNum}`);

    const updateData = {};

    // ALWAYS overwrite committee and latest_status from the API
    if (result.status?.committeeName) {
        const c = result.status.committeeName;
        updateData.committee = Array.isArray(c) ? c : [c];
    }

    if (result.status?.statusDesc) {
        const s = result.status.statusDesc;
        updateData.latest_status = Array.isArray(s) ? s : [s];
    }

    // Only fill title / sponsor if the field is currently empty in the DB
    if (!bill.title && result.title) {
        updateData.title = result.title;
    }

    const sponsorMember = result.sponsor?.member;
    if (sponsorMember) {
        const name = sponsorMember.fullName
            || `${sponsorMember.firstName || ''} ${sponsorMember.lastName || ''}`.trim()
            || sponsorMember.shortName;
        if (name) {
            if (billNum.startsWith('S') && !bill.senate_sponsor) {
                updateData.senate_sponsor = name;
            } else if (billNum.startsWith('A') && !bill.assembly_sponsor) {
                updateData.assembly_sponsor = name;
            }
        }
    }

    return Object.keys(updateData).length > 0 ? updateData : null;
}