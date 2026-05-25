import { base44 } from '@/api/base44Client';

/**
 * Fetches bill data from NY Senate Open Legislation API via LLM web search
 * and updates the bill record. Returns true if updated.
 */
export async function syncBill(bill, apiKey) {
  const billNum = bill.bill_number?.trim().toUpperCase();
  if (!billNum) return false;

  const year = bill.session_year || 2026;
  const isSenateBill = billNum.startsWith('S');
  const url = `https://legislation.nysenate.gov/api/3/bills/${year}/${billNum}?key=${apiKey}&view=with_refs`;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Please fetch the following NY Senate Open Legislation API URL and extract bill data from the JSON response:

URL: ${url}

This is bill ${billNum} (${isSenateBill ? 'Senate' : 'Assembly'} bill) from the ${year} session.

From the JSON response, extract:
1. title - the bill's full title (result.title)
2. latest_status - the status description (result.status.statusDesc)
3. committee - the committee name (result.status.committeeName)
4. senate_sponsor - The FULL NAME of the primary sponsor. 
   - Look in result.sponsor.member.fullName OR result.sponsor.member.shortName OR combine result.sponsor.member.firstName + result.sponsor.member.lastName
   - If result.sponsor is null, look in the latest amendment's multiSponsors or coSponsors items
   - ALWAYS return the senate sponsor name regardless of whether this is an A or S bill — it is the legislator who introduced the companion senate version
   - For an Assembly bill (starts with A), look in the latest amendment's sameAs items, then fetch that senate bill's sponsor, or look for any senate sponsor mentioned
5. assembly_sponsor - The full name of the assembly sponsor. For Assembly bills (starts with A), this is result.sponsor.member.fullName. For Senate bills this is null.
6. linked_senate_bill - The companion senate bill number from the latest amendment's sameAs.items[0].basePrintNo (null if none)
7. hearing_date - YYYY-MM-DD date from the most recent action whose text contains "HEARING", "REFERRED", "COMMITTED", or "FLOOR" (null if none)

Return a JSON object with exactly these keys.`,
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

  // Accept any non-null, non-empty string value
  const updateData = {};
  const fields = ['title', 'latest_status', 'committee', 'senate_sponsor', 'assembly_sponsor', 'linked_senate_bill', 'hearing_date'];
  for (const field of fields) {
    const val = result[field];
    if (val && typeof val === 'string' && val.trim() && val.trim().toLowerCase() !== 'null' && val.trim().toLowerCase() !== 'n/a') {
      updateData[field] = val.trim();
    }
  }

  if (Object.keys(updateData).length > 0) {
    await base44.entities.Bill.update(bill.id, updateData);
    return true;
  }
  return false;
}