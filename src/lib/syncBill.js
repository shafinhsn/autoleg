import { base44 } from '@/api/base44Client';

/**
 * Fetches bill data directly from NY Senate Open Legislation API
 * and updates the bill record. Returns true if any fields were updated.
 */
export async function syncBill(bill, apiKey) {
  const billNum = bill.bill_number?.trim().toUpperCase();
  if (!billNum) return false;

  const year = bill.session_year || 2026;
  const key = apiKey || 'tSBEMOLz2kk1HVzenAxZGy64XAMOBJmx';
  const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${key}&view=with_refs`;

  const resp = await fetch(url);
  if (!resp.ok) return false;

  const json = await resp.json();
  const result = json?.result;
  if (!result) return false;

  const updateData = {};

  // Title
  if (result.title) updateData.title = result.title;

  // Status
  if (result.status?.statusDesc) updateData.latest_status = result.status.statusDesc;

  // Committee
  if (result.status?.committeeName) updateData.committee = result.status.committeeName;

  // Primary sponsor — this is always the bill's own lead sponsor
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

  // For Assembly bills: look for a linked Senate companion bill (sameAs)
  // Then separately store the senate companion bill number and try to look up its sponsor
  const amendments = result.amendments?.items || {};
  const latestAmendmentKey = Object.keys(amendments).pop();
  const latestAmendment = latestAmendmentKey ? amendments[latestAmendmentKey] : null;

  if (latestAmendment) {
    const sameAsItems = latestAmendment.sameAs?.items || [];
    if (sameAsItems.length > 0) {
      const companion = sameAsItems[0];
      updateData.linked_senate_bill = companion.basePrintNo || companion.printNo;

      // If this is an Assembly bill, fetch the Senate companion's sponsor
      if (billNum.startsWith('A') && companion.basePrintNo) {
        try {
          const sUrl = `https://legislation.nysenate.gov/api/3/bills/${year}/${companion.basePrintNo}?key=${key}`;
          const sResp = await fetch(sUrl);
          if (sResp.ok) {
            const sJson = await sResp.json();
            const sMember = sJson?.result?.sponsor?.member;
            if (sMember) {
              const sName = sMember.fullName
                || `${sMember.firstName || ''} ${sMember.lastName || ''}`.trim()
                || sMember.shortName;
              if (sName) updateData.senate_sponsor = sName;
            }
          }
        } catch (_) { /* non-fatal */ }
      }
    }
  }

  // Hearing date: find most recent action mentioning a hearing/committee/floor
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

  if (Object.keys(updateData).length > 0) {
    await base44.entities.Bill.update(bill.id, updateData);
    return true;
  }
  return false;
}