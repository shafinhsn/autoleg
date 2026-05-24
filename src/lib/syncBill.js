import { base44 } from '@/api/base44Client';

/**
 * Fetches bill data from NY Senate Open Legislation API via LLM web search
 * and updates the bill record. Returns true if updated.
 */
export async function syncBill(bill, apiKey) {
  const billNum = bill.bill_number?.trim().toUpperCase();
  if (!billNum) return false;

  const year = bill.session_year || 2026;
  const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${apiKey}&view=with_refs`;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Fetch the JSON from this NY Senate Open Legislation API URL and extract the bill data: ${url}

Return ONLY a JSON object with these fields (use null if not available):
- title: the bill title
- latest_status: the statusDesc from status object
- committee: the committeeName from status object  
- senate_sponsor: sponsor full name if bill number starts with S, otherwise null
- assembly_sponsor: primary sponsor full name if bill number starts with A, otherwise null
- linked_senate_bill: the basePrintNo from sameAs items in the latest amendment (null if none)
- hearing_date: date (YYYY-MM-DD) from the most recent action with text containing "HEARING", "COMMITTEE", or "FLOOR" (null if none)`,
    add_context_from_internet: true,
    response_json_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        latest_status: { type: 'string' },
        committee: { type: 'string' },
        senate_sponsor: { type: 'string' },
        assembly_sponsor: { type: 'string' },
        linked_senate_bill: { type: 'string' },
        hearing_date: { type: 'string' },
      },
    },
  });

  if (!result) return false;

  const updateData = {};
  if (result.title) updateData.title = result.title;
  if (result.latest_status) updateData.latest_status = result.latest_status;
  if (result.committee) updateData.committee = result.committee;
  if (result.senate_sponsor) updateData.senate_sponsor = result.senate_sponsor;
  if (result.assembly_sponsor) updateData.assembly_sponsor = result.assembly_sponsor;
  if (result.linked_senate_bill) updateData.linked_senate_bill = result.linked_senate_bill;
  if (result.hearing_date) updateData.hearing_date = result.hearing_date;

  if (Object.keys(updateData).length > 0) {
    await base44.entities.Bill.update(bill.id, updateData);
    return true;
  }
  return false;
}