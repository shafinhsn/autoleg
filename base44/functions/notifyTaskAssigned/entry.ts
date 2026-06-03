import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { event, data, old_data, changed_fields } = await req.json();

        const task = data;
        if (!task) return Response.json({ skipped: true });

        // --- Case 1: Task completed — notify the assigner ---
        if (
            changed_fields?.includes('status') &&
            task.status === 'completed' &&
            task.office_id
        ) {
            // Find who created this task (the assigner)
            const offices = await base44.asServiceRole.entities.Office.filter({ id: task.office_id });
            const office = offices[0];

            // Get the creator's email via created_by_id
            const assignerEmail = task.created_by_id
                ? (await base44.asServiceRole.entities.User.filter({ id: task.created_by_id }))?.[0]?.email
                : office?.owner_email;

            if (assignerEmail) {
                const subject = `Assignment Completed: ${task.title}`;
                const body = `Hi,\n\nThe following assignment has been marked as completed:\n\n📋 ${task.title}\nAssigned to: ${task.assigned_to}${task.due_date ? `\nDue: ${task.due_date}` : ''}\n\nLog in to review the submission.\n\nThank you!`;

                await base44.asServiceRole.integrations.Core.SendEmail({ to: assignerEmail, subject, body });

                await base44.asServiceRole.entities.Notification.create({
                    user_email: assignerEmail,
                    office_id: task.office_id,
                    message: `✅ "${task.title}" was marked completed by ${task.assigned_to}`,
                    type: 'task_updated',
                    task_id: task.id || null,
                    link: '/assignments',
                    is_read: false,
                });

                console.log(`Notified assigner ${assignerEmail} of completion: ${task.title}`);
            }
            return Response.json({ success: true });
        }

        // --- Case 2: New assignment created — notify the assignee ---
        if (!task.assigned_to) return Response.json({ skipped: true });

        const assigneeEmail = task.assigned_to;
        const subject = `New Assignment: ${task.title}`;
        const dueText = task.due_date ? `\nDue: ${task.due_date}` : '';
        const descText = task.description ? `\n\n${task.description}` : '';
        const body = `Hi,\n\nYou have been assigned a new task:\n\n📋 ${task.title}${descText}\nPriority: ${task.priority || 'medium'}${dueText}\n\nLog in to view and manage your assignments.\n\nThank you!`;

        await base44.asServiceRole.integrations.Core.SendEmail({ to: assigneeEmail, subject, body });

        await base44.asServiceRole.entities.Notification.create({
            user_email: assigneeEmail,
            office_id: task.office_id,
            message: `You were assigned: "${task.title}"${task.due_date ? ` (due ${task.due_date})` : ''}`,
            type: 'task_assigned',
            task_id: task.id || null,
            link: '/assignments',
            is_read: false,
        });

        console.log(`Notified ${assigneeEmail} for task: ${task.title}`);
        return Response.json({ success: true });
    } catch (error) {
        console.error('Notification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});