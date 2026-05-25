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

  // Primary sponsor — always the bill's own lead sponsor
  // For Senate bills → senate_sponsor, for Assembly bills → assembly_sponsor
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

  if (latestAmendment) {
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

  if (Object.keys(updateData).length > 0) {
    await base44.entities.Bill.update(bill.id, updateData);
    return true;
  }
  return false;
}

/**
 * Fetches upcoming committee meeting dates from the NY Senate Agenda API
 * and updates hearing_date on bills whose committee name matches.
 * Returns count of bills updated.
 */
export async function syncCalendarDates(bills, apiKey) {
  const key = apiKey || 'tSBEMOLz2kk1HVzenAxZGy64XAMOBJmx';
  const year = new Date().getFullYear();

  // Fetch committee meetings for the next 60 days
  const from = new Date().toISOString().split('T')[0];
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 60);
  const to = toDate.toISOString().split('T')[0];

  const url = `https://legislation.nysenate.gov/api/3/agendas/meetings/${from}/${to}?key=${key}`;
  const resp = await fetch(url);
  if (!resp.ok) return 0;

  const json = await resp.json();
  const meetings = json?.result?.items || [];

  // Build a map of committeeName → earliest upcoming meeting date
  const committeeToDate = {};
  for (const meeting of meetings) {
    const committee = meeting.committeeId?.name;
    const meetingDate = meeting.meetingDateTime?.split('T')[0];
    if (committee && meetingDate) {
      if (!committeeToDate[committee] || meetingDate < committeeToDate[committee]) {
        committeeToDate[committee] = meetingDate;
      }
    }
  }

  // Also store meeting time and location if available
  const committeeToMeeting = {};
  for (const meeting of meetings) {
    const committee = meeting.committeeId?.name;
    const meetingDate = meeting.meetingDateTime?.split('T')[0];
    if (committee && meetingDate && committeeToDate[committee] === meetingDate) {
      committeeToMeeting[committee] = {
        date: meetingDate,
        time: meeting.meetingDateTime ? new Date(meeting.meetingDateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
        location: meeting.location || null,
      };
    }
  }

  // Update bills whose committee matches a scheduled meeting
  let updated = 0;
  for (const bill of bills) {
    const committee = bill.committee;
    if (!committee || !committeeToMeeting[committee]) continue;

    const { date, time, location } = committeeToMeeting[committee];
    const updateData = { hearing_date: date };
    if (time) updateData.hearing_time = time;
    if (location) updateData.hearing_location = location;

    await base44.entities.Bill.update(bill.id, updateData);
    updated++;
  }

  return updated;
}