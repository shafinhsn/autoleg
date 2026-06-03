import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, officeName, inviteCode, appUrl } = await req.json();

    if (!email || !officeName || !inviteCode) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const joinUrl = `${appUrl || 'https://yourapp.com'}/join?code=${inviteCode}`;

    const emailBody = `
You've been invited to the Office of ${officeName}

Join your team and start tracking bills by clicking the link below:
${joinUrl}

Enter the invite code if needed: ${inviteCode}

This is an automated message, please do not reply to this email.
    `.trim();

    await base44.integrations.Core.SendEmail({
      to: email,
      subject: `You're invited to the Office of ${officeName}`,
      body: emailBody,
      from_name: officeName,
    });

    console.log(`[sendOfficeInviteEmail] Invite sent to ${email} for office ${officeName}`);

    return Response.json({ success: true, message: `Invitation sent to ${email}` });
  } catch (error) {
    console.error('Error sending invite email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});