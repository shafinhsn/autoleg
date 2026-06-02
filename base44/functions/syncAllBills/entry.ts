import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const offices = await base44.asServiceRole.entities.Office.list();
        console.log(`Syncing bills for ${offices.length} offices`);

        for (const office of offices) {
            console.log(`Starting sync for office: ${office.name}`);
            const bills = await base44.asServiceRole.entities.Bill.filter({ office_id: office.id });
            const apiKey = office?.senate_api_key || '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';

            for (const bill of bills) {
                try {
                    const updateData = await syncBill(bill, apiKey);
                    if (updateData && Object.keys(updateData).length > 0) {
                        await base44.asServiceRole.entities.Bill.update(bill.id, updateData);
                        console.log(`✓ Updated ${bill.bill_number}: sponsor, committee, status`);
                    }
                } catch (e) {
                    console.error(`✗ Sync error for ${bill.bill_number}:`, e.message);
                }
                
                // Rate limit - 250ms between requests
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }

        return Response.json({ success: true, message: 'Daily sync completed' });
    } catch (error) {
        console.error('Sync failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

async function syncBill(bill, apiKey) {
    const billNum = bill.bill_number?.trim().toUpperCase();
    if (!billNum) return null;

    const year = bill.session_year || 2026;
    const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${apiKey}&view=with_refs`;

    const resp = await fetch(url);
    if (!resp.ok) return null;

    const json = await resp.json();
    const result = json?.result;
    if (!result) return null;

    const updateData = {};

    // 1. SENATE SPONSOR - extract primary sponsor name
    const sponsorMember = result.sponsor?.member;
    if (sponsorMember) {
        const sponsorName = sponsorMember.fullName
            || `${sponsorMember.firstName || ''} ${sponsorMember.lastName || ''}`.trim()
            || sponsorMember.shortName;
        
        if (sponsorName) {
            if (billNum.startsWith('S')) {
                updateData.senate_sponsor = sponsorName;
            } else {
                updateData.assembly_sponsor = sponsorName;
            }
        }
    }

    // 2. CURRENT COMMITTEE - from bill status
    if (result.status?.committeeName) {
        const committeeStr = result.status.committeeName;
        updateData.committee = Array.isArray(committeeStr) ? committeeStr : (committeeStr ? [committeeStr] : []);
    }

    // 3. STATUS - from bill status description
    if (result.status?.statusDesc) {
        const statusStr = result.status.statusDesc;
        updateData.latest_status = Array.isArray(statusStr) ? statusStr : (statusStr ? [statusStr] : []);
    }

    // Also update title if available
    if (result.title) {
        updateData.title = result.title;
    }

    return Object.keys(updateData).length > 0 ? updateData : null;
}