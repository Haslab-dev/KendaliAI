# Reminder Template

**Subject:** {{subject}}

Dear {{recipient_name}},

{{#custom_message}}
{{custom_message}}
{{/custom_message}}

{{#default_message}}
This is a friendly reminder about {{reminder_topic}}.
{{/default_message}}

**Due Date:** {{due_date}}

{{#action_required}}
**Action Required:** {{action_required}}
{{/action_required}}

Best regards,
{{sender_name}}
