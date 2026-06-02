import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { event, data } = await req.json();

        if (!data?.assigned_to) return Response.json({ skipped: true });

        const task = data;
        const assigneeEmail = task.assigned_to;

        // 1. Send email notification
        const subject = `New Task Assigned: ${task.title}`;
        const dueText = task.due_date ? `\nDue: ${task.due_date}` : '';
        const descText = task.description ? `\n\n${task.description}` : '';
        const body = `Hi,\n\nYou have been assigned a new task:\n\n📋 ${task.title}${descText}\nPriority: ${task.priority || 'medium'}${dueText}\n\nLog in to view and manage your assignments.\n\nThank you!`;

        await base44.asServiceRole.integrations.Core.SendEmail({
            to: assigneeEmail,
            subject,
            body,
        });

        // 2. Create in-app notification
        const message = `You were assigned a new task: "${task.title}"${task.due_date ? ` (due ${task.due_date})` : ''}`;
        await base44.asServiceRole.entities.Notification.create({
            user_email: assigneeEmail,
            office_id: task.office_id,
            message,
            type: 'task_assigned',
            task_id: task.id || null,
            link: '/tasks',
            is_read: false,
        });

        console.log(`Notified ${assigneeEmail} for task: ${task.title}`);
        return Response.json({ success: true });
    } catch (error) {
        console.error('Notification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});