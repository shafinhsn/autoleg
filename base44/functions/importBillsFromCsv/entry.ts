import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { rows, officeId, csvData } = await req.json();
    
    if (!officeId) {
      return Response.json({ error: 'Missing officeId' }, { status: 400 });
    }

    let parsedBills = [];
    
    // If rows provided directly (from frontend parsing), use them
    if (rows && Array.isArray(rows)) {
      parsedBills = rows;
    } else if (csvData) {
      // Otherwise use LLM to parse CSV data
      const llmResponse = await base44.integrations.Core.InvokeLLM({
        prompt: `Parse this CSV data for legislative bills. Extract each bill row and return a JSON array. Each bill should have: bill_number (required), title, short_name, senate_sponsor, assembly_sponsor, committee, latest_status (as array), section_header, tags (as array), priority_rank, pc_contact, next_steps, session_comments, lobbyist, bill_documents, internal_notes, staff_assignees, linked_senate_bill, google_drive_url, is_caucus_bill (boolean), hearing_date, hearing_time, hearing_location.
        
        Skip section header rows (like "TOP 5 PRIORITY"). Only return actual bill rows.
        
        CSV Data:
        ${csvData.slice(0, 50000)}${csvData.length > 50000 ? '...(truncated)' : ''}
        
        Return ONLY valid JSON array, no explanation.`,
        response_json_schema: {
          type: "object",
          properties: {
            bills: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  bill_number: { type: "string" },
                  title: { type: "string" },
                  short_name: { type: "string" },
                  senate_sponsor: { type: "string" },
                  assembly_sponsor: { type: "string" },
                  committee: { type: "string" },
                  latest_status: { type: "array", items: { type: "string" } },
                  section_header: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  priority_rank: { type: "string" },
                  pc_contact: { type: "string" },
                  next_steps: { type: "string" },
                  session_comments: { type: "string" },
                  lobbyist: { type: "string" },
                  bill_documents: { type: "string" },
                  internal_notes: { type: "string" },
                  staff_assignees: { type: "string" },
                  linked_senate_bill: { type: "string" },
                  google_drive_url: { type: "string" },
                  is_caucus_bill: { type: "boolean" },
                  hearing_date: { type: "string" },
                  hearing_time: { type: "string" },
                  hearing_location: { type: "string" }
                }
              }
            }
          },
          required: ["bills"]
        }
      });
      parsedBills = llmResponse.bills || [];
    }
    
    if (parsedBills.length === 0) {
      return Response.json({ error: 'No valid bill rows found in CSV' }, { status: 400 });
    }

    // Get existing bills and sections
    const existingBills = await base44.asServiceRole.entities.Bill.filter({ office_id: officeId });
    const existingSections = await base44.asServiceRole.entities.SectionHeader.filter({ office_id: officeId });
    
    const existingMap = {};
    existingBills.forEach(b => { existingMap[b.bill_number?.toUpperCase()] = b; });
    
    const existingSectionNames = new Set(existingSections.map(s => s.name));
    const newSectionNames = new Set();

    // Process bills with rate limiting
    let created = 0, updated = 0, errors = 0;
    const errorDetails = [];

    // Create missing sections first
    for (const bill of parsedBills) {
      if (bill.section_header && !existingSectionNames.has(bill.section_header)) {
        newSectionNames.add(bill.section_header);
      }
    }

    let sectionOrder = existingSections.length;
    for (const sectionName of newSectionNames) {
      await base44.asServiceRole.entities.SectionHeader.create({
        office_id: officeId,
        name: sectionName,
        color: getSectionColor(sectionName),
        sort_order: sectionOrder++,
      });
      await sleep(100); // Rate limit
    }

    // Process bills in batches with delays
    const batchSize = 3; // Smaller batch to avoid rate limits
    for (let i = 0; i < parsedBills.length; i += batchSize) {
      const batch = parsedBills.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (row) => {
        const billNum = String(row.bill_number || '').trim().toUpperCase();
        if (!billNum || !/^[AS]\d+$/.test(billNum)) {
          errors++;
          errorDetails.push({ bill: billNum || 'unknown', error: 'Invalid bill number format' });
          return;
        }

        const billData = {
          office_id: officeId,
          bill_number: billNum,
          chamber: billNum.startsWith('S') ? 'Senate' : 'Assembly',
          session_year: 2026,
        };

        // Add string fields
        const stringFields = ['title', 'short_name', 'senate_sponsor', 'assembly_sponsor', 'committee', 
          'section_header', 'priority_rank', 'pc_contact', 'next_steps', 'session_comments', 
          'lobbyist', 'bill_documents', 'internal_notes', 'staff_assignees', 'linked_senate_bill', 
          'google_drive_url', 'hearing_date', 'hearing_time', 'hearing_location'];
        
        stringFields.forEach(field => {
          const val = String(row[field] || '').trim();
          if (val) billData[field] = val;
        });

        // Add array fields
        if (row.latest_status) {
          billData.latest_status = Array.isArray(row.latest_status) ? row.latest_status : [row.latest_status];
        }
        if (row.tags) {
          billData.tags = Array.isArray(row.tags) ? row.tags : [row.tags];
        }

        // Boolean field
        if (row.is_caucus_bill !== undefined) {
          billData.is_caucus_bill = ['true', 'yes', '1', 'x'].includes(String(row.is_caucus_bill).toLowerCase());
        }

        // Ensure section_header matches first tag if available
        if (!billData.section_header && billData.tags?.length > 0) {
          billData.section_header = billData.tags[0];
        }

        try {
          if (existingMap[billNum]) {
            await base44.asServiceRole.entities.Bill.update(existingMap[billNum].id, billData);
            updated++;
          } else {
            await base44.asServiceRole.entities.Bill.create(billData);
            created++;
          }
        } catch (e) {
          errors++;
          errorDetails.push({ bill: billNum, error: e.message || String(e) });
        }
      }));

      // Delay between batches to respect rate limits
      if (i + batchSize < parsedBills.length) {
        await sleep(500); // 500ms delay between batches
      }
    }

    return Response.json({ created, updated, errors, errorDetails: errorDetails.slice(0, 100) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getSectionColor(name) {
  const colors = {
    'TOP 5 PRIORITY': '#dc2626',
    'TOP 10 PRIORITY': '#ea580c',
    'ACTIVE': '#2563eb',
    'PASSED': '#16a34a',
    'BUDGET': '#9333ea',
    'POST BUDGET': '#f59e0b',
    'MONITORING': '#6b7280',
  };
  return colors[name] || '#2563eb';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}