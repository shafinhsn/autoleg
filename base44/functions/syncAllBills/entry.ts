import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Use service role for scheduled automation (no user context)
        const offices = await base44.asServiceRole.entities.Office.list();

        for (const office of offices) {
            console.log(`Starting sync for office: ${office.name}`);
            const bills = await base44.asServiceRole.entities.Bill.filter({ office_id: office.id });
            const apiKey = office?.senate_api_key || '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';

            for (const bill of bills) {
                try {
                    const updateData = await syncBill(bill, apiKey);
                    if (updateData) {
                        await base44.asServiceRole.entities.Bill.update(bill.id, updateData);
                        console.log(`Updated bill ${bill.bill_number} for office ${office.name}`);
                    }
                } catch (e) {
                    console.error(`Sync error for bill ${bill.bill_number} in office ${office.name}:`, e);
                }
                // Introduce a delay to respect API rate limits
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            console.log(`Finished sync for office: ${office.name}`);
        }

        return Response.json({ success: true, message: 'All bills sync completed successfully.' });
    } catch (error) {
        console.error('Error in syncAllBills function:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

/**
 * Fetches bill data from NY Senate Open Legislation API
 * and returns update data for changed fields.
 */
async function syncBill(bill, apiKey) {
    const billNum = bill.bill_number?.trim().toUpperCase();
    if (!billNum) return null;

    const year = bill.session_year || 2026;
    const key = apiKey || '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';
    const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${key}&view=with_refs`;

    const resp = await fetch(url);
    if (!resp.ok) return null;

    const json = await resp.json();
    const result = json?.result;
    if (!result) return null;

    const updateData = {};

    // Update key fields from API
    updateData.title = result.title || bill.title || '';
    updateData.latest_status = result.status?.statusDesc ? [result.status.statusDesc] : [];
    updateData.committee = result.status?.committeeName ? [result.status.committeeName] : [];

    // Primary sponsor
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

    // Linked Senate companion bill
    const amendments = result.amendments?.items || {};
    const latestAmendmentKey = Object.keys(amendments).sort().pop();
    const latestAmendment = latestAmendmentKey ? amendments[latestAmendmentKey] : null;

    if (latestAmendment) {
        const sameAsItems = latestAmendment.sameAs?.items || [];
        if (sameAsItems.length > 0) {
            const companion = sameAsItems[0];
            const companionNum = companion.basePrintNo || companion.printNo;
            if (companionNum) updateData.linked_senate_bill = companionNum;
        }
    }

    // Hearing date from actions
    const actions = result.actions?.items || [];
    for (let i = actions.length - 1; i >= 0; i--) {
        const action = actions[i];
        const text = (action.text || '').toUpperCase();
        if (text.includes('HEARING') || text.includes('COMMITTEE') || text.includes('FLOOR')) {
            if (action.date) {
                updateData.hearing_date = action.date.split('T')[0];
                break;
            }
        }
    }

    return Object.keys(updateData).length > 0 ? updateData : null;
}