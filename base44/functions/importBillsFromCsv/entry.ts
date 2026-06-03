import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { rows, officeId } = await req.json();

    console.log('Import request:', { officeId, rowsCount: rows?.length });

    if (!officeId) {
      return Response.json({ error: 'Missing officeId' }, { status: 400 });
    }
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: 'No valid rows provided.' }, { status: 400 });
    }
    if (!rows[0].bill_number) {
      return Response.json({ error: 'Missing bill_number field.', receivedFields: Object.keys(rows[0]) }, { status: 400 });
    }

    // Get existing bills and sections
    const [existingBills, existingSections] = await Promise.all([
      base44.asServiceRole.entities.Bill.filter({ office_id: officeId }),
      base44.asServiceRole.entities.SectionHeader.filter({ office_id: officeId }),
    ]);

    const existingMap = {};
    existingBills.forEach(b => { existingMap[b.bill_number?.toUpperCase()] = b; });
    const existingSectionNames = new Set(existingSections.map(s => s.name));
    const newSectionNames = new Set();

    function splitMultiValue(val) {
      if (!val) return [];
      return String(val).split(/[;,]/).map(s => s.trim()).filter(s => s.length > 0);
    }

    function normalizeBillNumber(billStr) {
      if (!billStr) return null;
      let n = String(billStr).trim().toUpperCase().replace(/-/g, '').replace(/\s+/g, '');
      const match = n.match(/^([AS])(\d+)/);
      return match ? match[1] + match[2] : null;
    }

    // Collect unique tracker values
    const uniquePriorities = new Set();
    const uniqueStatuses = new Set();
    const uniqueCommittees = new Set();
    const uniqueTags = new Set();

    // Build bill data objects
    const toCreate = [];
    const toUpdate = [];
    const errorDetails = [];

    for (const row of rows) {
      const billNum = normalizeBillNumber(row.bill_number);
      if (!billNum || !/^[AS]\d+$/.test(billNum)) {
        errorDetails.push({ bill: row.bill_number || 'unknown', error: 'Invalid bill number format' });
        continue;
      }

      const billData = {
        office_id: officeId,
        bill_number: billNum,
        chamber: billNum.startsWith('S') ? 'Senate' : 'Assembly',
        session_year: 2026,
      };

      const stringFields = ['title', 'short_name', 'senate_sponsor', 'assembly_sponsor',
        'section_header', 'priority_rank', 'pc_contact', 'next_steps', 'session_comments',
        'lobbyist', 'bill_documents', 'internal_notes', 'staff_assignees', 'linked_senate_bill',
        'google_drive_url', 'hearing_date', 'hearing_time', 'hearing_location', 'section_85'];

      stringFields.forEach(field => {
        const val = String(row[field] || '').trim();
        if (val) billData[field] = val;
      });

      if (row.latest_status) {
        billData.latest_status = Array.isArray(row.latest_status) ? row.latest_status : splitMultiValue(row.latest_status);
        billData.latest_status.forEach(s => uniqueStatuses.add(s));
      }
      if (row.tags) {
        billData.tags = Array.isArray(row.tags) ? row.tags : splitMultiValue(row.tags);
        billData.tags.forEach(t => uniqueTags.add(t));
      }
      const committeeVal = row.committee;
      billData.committee = committeeVal ? (Array.isArray(committeeVal) ? committeeVal : splitMultiValue(committeeVal)) : [];
      billData.committee.forEach(c => uniqueCommittees.add(c));

      if (row.is_caucus_bill !== undefined) {
        billData.is_caucus_bill = ['true', 'yes', '1', 'x'].includes(String(row.is_caucus_bill).toLowerCase());
      }

      if (!billData.section_header && billData.tags?.length > 0) {
        billData.section_header = billData.tags[0];
      }

      if (billData.section_header && !existingSectionNames.has(billData.section_header)) {
        newSectionNames.add(billData.section_header);
        uniquePriorities.add(billData.section_header);
      }

      if (existingMap[billNum]) {
        toUpdate.push({ id: existingMap[billNum].id, data: billData });
      } else {
        toCreate.push(billData);
      }
    }

    // Create section headers
    let sectionOrder = existingSections.length;
    for (const sectionName of newSectionNames) {
      try {
        await base44.asServiceRole.entities.SectionHeader.create({
          office_id: officeId,
          name: sectionName,
          color: getSectionColor(sectionName),
          sort_order: sectionOrder++,
        });
      } catch (e) {
        console.error('Failed to create section:', sectionName, e.message);
      }
    }

    // Bulk create new bills in batches of 20
    let created = 0;
    const BATCH_SIZE = 20;
    const failedBills = [];

    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      try {
        await base44.asServiceRole.entities.Bill.bulkCreate(batch);
        created += batch.length;
      } catch (e) {
        const msg = e.message || String(e);
        if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
          // Wait and retry once
          await sleep(2000);
          try {
            await base44.asServiceRole.entities.Bill.bulkCreate(batch);
            created += batch.length;
          } catch (e2) {
            failedBills.push(...batch);
          }
        } else {
          // Fall back to one-by-one to find the bad record
          for (const bill of batch) {
            try {
              await base44.asServiceRole.entities.Bill.create(bill);
              created++;
            } catch (e3) {
              errorDetails.push({ bill: bill.bill_number, error: e3.message || String(e3) });
            }
          }
        }
      }
      if (i + BATCH_SIZE < toCreate.length) await sleep(500);
    }

    // Update existing bills in batches
    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      for (const { id, data } of batch) {
        try {
          await base44.asServiceRole.entities.Bill.update(id, data);
          updated++;
        } catch (e) {
          const msg = e.message || String(e);
          if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
            await sleep(1000);
            try {
              await base44.asServiceRole.entities.Bill.update(id, data);
              updated++;
            } catch {
              failedBills.push(data);
            }
          } else {
            errorDetails.push({ bill: data.bill_number, error: msg });
          }
        }
      }
      if (i + BATCH_SIZE < toUpdate.length) await sleep(300);
    }

    // Update tracker configs
    await Promise.all([
      updateTrackerConfig(base44, officeId, 'priority_tags', Array.from(uniquePriorities)),
      updateTrackerConfig(base44, officeId, 'bill_statuses', Array.from(uniqueStatuses)),
      updateTrackerConfig(base44, officeId, 'committees', Array.from(uniqueCommittees)),
      updateTrackerConfig(base44, officeId, 'tags', Array.from(uniqueTags)),
    ]);

    return Response.json({
      created,
      updated,
      errors: errorDetails.length,
      errorDetails: errorDetails.slice(0, 100),
      failedBills,
    });
  } catch (error) {
    console.error('Import failed:', error);
    return Response.json({ error: error.message || 'Import failed' }, { status: 500 });
  }
});

const CONFIG_COLORS = ['Red', 'Orange', 'Amber', 'Yellow', 'Green', 'Emerald', 'Teal', 'Sky', 'Blue', 'Indigo', 'Violet', 'Purple', 'Pink'];

function getSectionColor(name) {
  const colors = {
    'TOP 5 PRIORITY': '#dc2626', 'TOP 5 PRIORITY ROUND 1': '#dc2626', 'TOP 5 PRIORITY ROUND 2': '#dc2626',
    'TOP 10 PRIORITY': '#2563eb', 'TOP 10 PRIORITY ROUND 2': '#3b82f6',
    'ACTIVE': '#16a34a', '2026 ACTIVE BILLS': '#16a34a', 'PASSED ASSEMBLY': '#16a34a',
    'PASSED': '#7c3aed', 'BUDGET': '#d97706', '2026 BUDGET': '#d97706', '2026 FINAL BUDGET': '#d97706',
    'POST BUDGET': '#ea580c', 'POST SESSION': '#f59e0b',
    'END OF SESSION WATCHLIST': '#7c3aed', 'MONITORING': '#6b7280',
    'TIER 2 PRIORITY': '#8b5cf6', 'LEGACY BILLS': '#6b7280', 'NEW BILLS': '#06b6d4',
    'LOCAL GOVERNMENT': '#14b8a6', 'CAUCUS BILLS': '#0891b2', 'ROUND 3 PRIORITY': '#f97316',
  };
  return colors[name] || '#2563eb';
}

async function updateTrackerConfig(base44, officeId, configType, newLabels) {
  try {
    const existing = await base44.asServiceRole.entities.TrackerConfig.filter({ office_id: officeId, config_type: configType });
    const config = existing[0];
    const existingLabels = new Set(config?.items?.map(i => i.label) || []);
    const items = [...(config?.items || [])];
    newLabels.forEach((label, idx) => {
      if (!existingLabels.has(label)) {
        items.push({ label, color: CONFIG_COLORS[(items.length + idx) % CONFIG_COLORS.length], sort_order: items.length + idx });
      }
    });
    if (config) {
      await base44.asServiceRole.entities.TrackerConfig.update(config.id, { items });
    } else if (items.length > 0) {
      await base44.asServiceRole.entities.TrackerConfig.create({ office_id: officeId, config_type: configType, items });
    }
  } catch (e) {
    console.error(`Failed to update tracker config ${configType}:`, e.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}