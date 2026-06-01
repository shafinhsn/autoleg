import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { headers, sampleRows } = await req.json();
    
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return Response.json({ error: 'No headers provided' }, { status: 400 });
    }

    // Use AI to analyze headers and suggest mappings
    const prompt = `You are a CSV header mapping assistant for legislative bill tracking.
    
    Analyze these CSV headers and map them to the target fields.
    
    Available target fields:
    - bill_number (required): Bill number like A1234 or S5678
    - title: Full bill title
    - short_name: Short name or nickname
    - senate_sponsor: Senate sponsor name
    - assembly_sponsor: Assembly sponsor name
    - committee: Committee assignment
    - latest_status: Current status
    - section_header: Section/category (e.g., TOP 5 PRIORITY)
    - tags: Priority tags
    - priority_rank: Priority ranking
    - pc_contact: P&C Contact
    - next_steps: Next steps
    - session_comments: Session comments
    - lobbyist: Lobbyist/advocate
    - bill_documents: Bill documents link
    - internal_notes: Internal notes
    - staff_assignees: Staff assigned
    - linked_senate_bill: Companion senate bill
    - google_drive_url: Google Drive link
    - is_caucus_bill: Caucus bill (boolean)
    - hearing_date: Hearing date
    - hearing_time: Hearing time
    - hearing_location: Hearing location
    
    CSV Headers to analyze: ${JSON.stringify(headers)}
    Sample data (first row): ${JSON.stringify(sampleRows?.[0] || {})}
    
    Return a JSON object mapping each CSV header to a target field or "skip" if it should be ignored.
    Only return the mapping object, nothing else.
    
    Example response format:
    {"Bill #": "bill_number", "Title": "title", "Sponsor": "senate_sponsor", "Notes": "skip"}`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          mapping: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Mapping of CSV headers to target fields',
          },
        },
        required: ['mapping'],
      },
    });

    return Response.json({ mapping: response.mapping || {} });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});