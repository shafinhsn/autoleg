import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { billIds, officeId } = await req.json();
    
    if (!billIds || !Array.isArray(billIds) || billIds.length === 0) {
      return Response.json({ error: 'Invalid or empty billIds array' }, { status: 400 });
    }

    let deleted = 0;
    let errors = 0;
    const errorDetails = [];

    // Delete in batches with rate limiting
    const batchSize = 5;
    for (let i = 0; i < billIds.length; i += batchSize) {
      const batch = billIds.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (id) => {
        try {
          await base44.asServiceRole.entities.Bill.delete(id);
          deleted++;
        } catch (e) {
          errors++;
          errorDetails.push({ id, error: e.message || String(e) });
        }
      }));

      // Delay between batches to respect rate limits
      if (i + batchSize < billIds.length) {
        await sleep(200); // 200ms delay between batches
      }
    }

    return Response.json({ deleted, errors, errorDetails: errorDetails.slice(0, 50) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}