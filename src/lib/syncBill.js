/**
 * Fetches bill data directly from NY Senate Open Legislation API
 * and updates the bill record. Supports both Assembly and Senate bills.
 * For Assembly bills, finds the Senate companion to get sponsors, then
 * extracts committee and status from the Assembly bill data.
 * Returns update data object if changes found, null otherwise.
 */

function toStringArray(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

/** Normalize sync payload to match Bill entity schema (arrays for committee/status). */
export function normalizeSyncUpdateData(data) {
  if (!data || typeof data !== 'object') return null;

  const normalized = { ...data };

  if (normalized.committee !== undefined) {
    normalized.committee = toStringArray(normalized.committee);
    if (normalized.committee.length === 0) delete normalized.committee;
  }

  if (normalized.latest_status !== undefined) {
    normalized.latest_status = toStringArray(normalized.latest_status);
    if (normalized.latest_status.length === 0) delete normalized.latest_status;
  }

  if (normalized.hearing_date == null || normalized.hearing_date === '') {
    delete normalized.hearing_date;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export async function syncBill(bill, apiKey) {
  const billNum = bill.bill_number?.trim().toUpperCase();
  if (!billNum) return null;

  const year = bill.session_year || 2026;
  const key = apiKey || '5OuWFvXYcEmkPHLLaRPiHDHbVgnamYTL';
  const isAssembly = !billNum.startsWith('S');
  
  console.log(`Syncing ${billNum} (${year}) - ${isAssembly ? 'Assembly' : 'Senate'}...`);
  
  // First, fetch the bill itself (whether Assembly or Senate)
  const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${key}&view=with_refs`;
  const resp = await fetch(url);
  console.log(`API response for ${billNum}: ${resp.status}`);
  if (!resp.ok) {
    console.error(`API error for ${billNum}: ${resp.status}`);
    return null;
  }

  const json = await resp.json();
  const result = json?.result;
  if (!result) {
    console.error(`No result for ${billNum}`);
    return null;
  }

  const updateData = {};

  // Update title
  if (result.title) {
    updateData.title = result.title;
  }
  
  // Extract ALL statuses from actions (not just current status)
  const actions = result.actions?.items || [];
  const statusSet = new Set();
  let hearingDate = null;
  
  // Get current status
  if (result.status?.statusDesc) {
    statusSet.add(result.status.statusDesc);
  }
  
  // Also extract statuses from recent actions for more context
  actions.slice(-5).forEach(action => {
    const text = (action.text || '').toUpperCase();
    if (text.includes('COMMITTEE')) statusSet.add('In Committee');
    if (text.includes('PASSED')) {
      if (text.includes('SENATE')) statusSet.add('Passed Senate');
      if (text.includes('ASSEMBLY')) statusSet.add('Passed Assembly');
    }
    if (text.includes('FLOOR')) statusSet.add('Floor Calendar');
    if (text.includes('SIGNED')) statusSet.add('Signed');
    if (text.includes('VETO')) statusSet.add('Vetoed');
    
    // Extract hearing date from actions
    if (!hearingDate && (text.includes('HEARING') || text.includes('COMMITTEE'))) {
      if (action.date) {
        hearingDate = action.date.split('T')[0];
      }
    }
  });
  
  if (statusSet.size > 0) {
    updateData.latest_status = Array.from(statusSet);
  }

  if (result.status?.committeeName) {
    updateData.committee = [result.status.committeeName];
  }

  if (hearingDate) {
    updateData.hearing_date = hearingDate;
  }
  
  console.log(`${billNum} extracted statuses:`, updateData.latest_status);
  console.log(`${billNum} committee:`, updateData.committee);

  // Extract sponsors based on chamber
  const sponsorMember = result.sponsor?.member;
  if (sponsorMember) {
    const name = sponsorMember.fullName
      || `${sponsorMember.firstName || ''} ${sponsorMember.lastName || ''}`.trim()
      || sponsorMember.shortName;
    if (name) {
      if (isAssembly) {
        updateData.assembly_sponsor = name;
      } else {
        updateData.senate_sponsor = name;
      }
    }
  }

  // For Assembly bills, fetch Senate companion sponsor only
  if (isAssembly) {
    const amendments = result.amendments?.items || {};
    const latestAmendmentKey = Object.keys(amendments).sort().pop();
    const latestAmendment = latestAmendmentKey ? amendments[latestAmendmentKey] : null;

    if (latestAmendment) {
      const sameAsItems = latestAmendment.sameAs?.items || [];
      if (sameAsItems.length > 0) {
        const companion = sameAsItems[0];
        const companionNum = companion.basePrintNo || companion.printNo;
        if (companionNum && companionNum.startsWith('S')) {
          updateData.linked_senate_bill = companionNum;
          console.log(`${billNum} fetching senate sponsor from ${companionNum}...`);
          try {
            const senateUrl = `https://legislation.nysenate.gov/api/3/bills/${year}/${companionNum}?key=${key}`;
            const senateResp = await fetch(senateUrl);
            if (senateResp.ok) {
              const senateJson = await senateResp.json();
              const senateSponsor = senateJson?.result?.sponsor?.member;
              if (senateSponsor) {
                const sName = senateSponsor.fullName
                  || `${senateSponsor.firstName || ''} ${senateSponsor.lastName || ''}`.trim()
                  || senateSponsor.shortName;
                if (sName) {
                  updateData.senate_sponsor = sName;
                  console.log(`${billNum} got senate sponsor: ${sName}`);
                }
              }
            }
          } catch (e) { 
            console.error(`${billNum} error fetching senate sponsor:`, e.message);
          }
        }
      }
    }
  }

  const normalized = normalizeSyncUpdateData(updateData);
  console.log(`${billNum} final updateData:`, JSON.stringify(normalized, null, 2));
  return normalized;
}
