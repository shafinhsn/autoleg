import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DEFAULT_API_KEY = '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        let officeId = null;
        try {
            const body = await req.clone().json();
            officeId = body?.officeId || null;
        } catch { /* scheduled call */ }

        let billsToSync = [];

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

        console.log(`Starting sequential sync for ${billsToSync.length} bills`);

        let updated = 0;
        let errors = 0;
        let skipped = 0;

        // Process ONE bill at a time to avoid Base44 rate limits
        for (const bill of billsToSync) {
            try {
                const updateData = await fetchBillFromAPI(bill, bill._apiKey);

                if (updateData) {
                    // Wait before each SDK write to avoid rate limits
                    await sleep(300);
                    await base44.asServiceRole.entities.Bill.update(bill.id, updateData);
                    console.log(`✓ ${bill.bill_number}: title="${updateData.title || '(unchanged)'}", committee=${JSON.stringify(updateData.committee)}, status=${JSON.stringify(updateData.latest_status)}, sponsor="${updateData.assembly_sponsor || updateData.senate_sponsor || '(unchanged)'}"`);
                    updated++;
                } else {
                    skipped++;
                    console.log(`- ${bill.bill_number}: no data from API, skipped`);
                }

                // Small delay between API fetches to respect Senate API rate limits
                await sleep(150);

            } catch (err) {
                errors++;
                console.error(`✗ ${bill.bill_number}: ${err.message}`);
                // On rate limit error, wait longer before continuing
                if (err.message?.includes('Rate limit') || err.message?.includes('429')) {
                    console.log('Rate limited — waiting 2s before continuing...');
                    await sleep(2000);
                }
            }
        }

        console.log(`Sync complete: ${updated} updated, ${skipped} skipped (no API data), ${errors} errors out of ${billsToSync.length}`);
        return Response.json({ success: true, updated, errors, skipped, total: billsToSync.length });

    } catch (error) {
        console.error('Sync failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBillFromAPI(bill, apiKey) {
    const billNum = bill.bill_number?.trim().toUpperCase();
    if (!billNum || !/^[AS]\d+/.test(billNum)) {
        throw new Error(`Invalid bill number: "${billNum}"`);
    }

    // Try 2026 session first, fall back to 2025 (bills in 2025-2026 session are keyed under 2025)
    const sessionsToTry = [2025, 2026];
    let json = null;

    for (const year of sessionsToTry) {
        const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${apiKey}&view=with_refs`;
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.success && data.result) {
            json = data;
            break;
        }
    }

    if (!json?.result) return null;

    const result = json.result;
    const updateData = {};

    // Always overwrite title from API
    if (result.title) {
        updateData.title = result.title;
    }

    // Always overwrite committee from API
    if (result.status?.committeeName) {
        const c = result.status.committeeName;
        updateData.committee = Array.isArray(c) ? c : [c];
    } else {
        updateData.committee = [];
    }

    // Always overwrite status from API
    if (result.status?.statusDesc) {
        const s = result.status.statusDesc;
        updateData.latest_status = Array.isArray(s) ? s : [s];
    }

    // Always overwrite sponsor from API
    const sponsorMember = result.sponsor?.member;
    if (sponsorMember) {
        const name = sponsorMember.fullName
            || `${sponsorMember.firstName || ''} ${sponsorMember.lastName || ''}`.trim()
            || sponsorMember.shortName;
        if (name) {
            if (billNum.startsWith('S')) {
                updateData.senate_sponsor = name;
            } else {
                updateData.assembly_sponsor = name;
            }
        }
    }

    // Try to get senate companion bill sponsor if this is an assembly bill
    if (billNum.startsWith('A')) {
        try {
            const sameAsItems = result.amendments?.items?.['']?.sameAs?.items
                || result.amendments?.items?.['A']?.sameAs?.items
                || [];
            const senateBill = sameAsItems.find(x => x.basePrintNo?.startsWith('S'));
            if (senateBill) {
                const sUrl = `https://legislation.nysenate.gov/api/3/bills/${senateBill.session || 2025}/${senateBill.basePrintNo}?key=${apiKey}`;
                const sResp = await fetch(sUrl);
                if (sResp.ok) {
                    const sData = await sResp.json();
                    if (sData.success && sData.result?.sponsor?.member) {
                        const sm = sData.result.sponsor.member;
                        const sname = sm.fullName || `${sm.firstName || ''} ${sm.lastName || ''}`.trim();
                        if (sname) updateData.senate_sponsor = sname;
                    }
                }
            }
        } catch { /* companion bill fetch is optional */ }
    }

    return Object.keys(updateData).length > 0 ? updateData : null;
}