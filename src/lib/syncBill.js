/**
 * Fetches bill data directly from NY Senate Open Legislation API
 * and updates the bill record. Returns true if any fields were updated.
 */
export async function syncBill(bill, apiKey) {
  const billNum = bill.bill_number?.trim().toUpperCase();
  if (!billNum) return null;

  const year = bill.session_year || 2026;
  const key = apiKey || '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';
  const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${key}&view=with_refs`;

  console.log(`Syncing ${billNum} (${year})...`);
  const resp = await fetch(url);
  console.log(`API response for ${billNum}: ${resp.status}`);
  if (!resp.ok) {
    console.error(`API error for ${billNum}: ${resp.status}`);
    return null;
  }

  const json = await resp.json();
  console.log(`API response for ${billNum}:`, JSON.stringify(json).substring(0, 200) + '...');
  const result = json?.result;
  if (!result) {
    console.error(`No result for ${billNum}`);
    return null;
  }

  const updateData = {};

  // Force overwrite key fields from API — no stale data
  updateData.title = result.title || bill.title || '';
  updateData.latest_status = result.status?.statusDesc ? [result.status.statusDesc] : [];
  updateData.committee = result.status?.committeeName || '';
  
  console.log(`${billNum} API status:`, JSON.stringify(result.status, null, 2));

  // Primary sponsor of this bill
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

  // Linked Senate companion bill from the latest amendment's sameAs
  const amendments = result.amendments?.items || {};
  const latestAmendmentKey = Object.keys(amendments).sort().pop();
  const latestAmendment = latestAmendmentKey ? amendments[latestAmendmentKey] : null;

  // For Assembly bills: try to find senate sponsor via sameAs companion or stored linked_senate_bill
  if (!billNum.startsWith('S')) {
    let companionNum = null;

    console.log(`${billNum} latestAmendment:`, latestAmendment ? 'exists' : 'null');
    if (latestAmendment) {
      const sameAsItems = latestAmendment.sameAs?.items || [];
      console.log(`${billNum} sameAs items:`, sameAsItems.length);
      if (sameAsItems.length > 0) {
        const companion = sameAsItems[0];
        companionNum = companion.basePrintNo || companion.printNo;
        console.log(`${billNum} companion from sameAs:`, companionNum);
        if (companionNum) updateData.linked_senate_bill = companionNum;
      }
    }

    // Fall back to already-stored linked senate bill
    if (!companionNum && bill.linked_senate_bill) {
      companionNum = bill.linked_senate_bill;
      console.log(`${billNum} using stored linked_senate_bill:`, companionNum);
    }

    if (companionNum && companionNum.toUpperCase().startsWith('S')) {
      console.log(`${billNum} fetching senate companion ${companionNum}...`);
      try {
        const senateUrl = `https://legislation.nysenate.gov/api/3/bills/${year}/${companionNum}?key=${key}`;
        const senateResp = await fetch(senateUrl);
        console.log(`${billNum} senate API response: ${senateResp.status}`);
        if (senateResp.ok) {
          const senateJson = await senateResp.json();
          const senateSponsor = senateJson?.result?.sponsor?.member;
          console.log(`${billNum} senate sponsor member:`, senateSponsor ? senateSponsor.fullName || senateSponsor.shortName : 'null');
          if (senateSponsor) {
            const sName = senateSponsor.fullName
              || `${senateSponsor.firstName || ''} ${senateSponsor.lastName || ''}`.trim()
              || senateSponsor.shortName;
            if (sName) {
              console.log(`${billNum} setting senate_sponsor to: ${sName}`);
              updateData.senate_sponsor = sName;
            }
          }
        } else {
          console.error(`${billNum} failed to fetch senate companion: ${senateResp.status}`);
        }
      } catch (e) { 
        console.error(`${billNum} error fetching senate companion:`, e.message);
      }
    } else {
      console.log(`${billNum} no companionNum found or doesn't start with S`);
    }
  } else if (latestAmendment) {
    // Senate bill — still track sameAs for linked assembly bill
    const sameAsItems = latestAmendment.sameAs?.items || [];
    if (sameAsItems.length > 0) {
      const companion = sameAsItems[0];
      const companionNum = companion.basePrintNo || companion.printNo;
      if (companionNum) updateData.linked_senate_bill = companionNum;
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

  return Object.keys(updateData).length > 0 ? updateData : null;
}