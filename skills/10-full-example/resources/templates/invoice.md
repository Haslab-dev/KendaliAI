# Invoice Template

**Invoice Number:** {{invoice_number}}
**Date:** {{date}}
**Due Date:** {{due_date}}

## Bill To

{{client_name}}
{{client_address}}

## Items

| Description | Quantity | Unit Price | Total |
|-------------|----------|------------|-------|
{{#items}}
| {{description}} | {{quantity}} | ${{unit_price}} | ${{total}} |
{{/items}}

## Total: ${{grand_total}}

**Payment Terms:** {{payment_terms}}

---

Thank you for your business!
