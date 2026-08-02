"""Curated catalog of popular integrations.

Renders the pre-built integrations grid even before a Composio key is set, and
maps our display metadata (category, brand color, popularity) onto Composio
toolkit slugs. When Composio is configured, the live catalog is merged on top
(real tool counts + logos), but this guarantees a rich grid offline.

Slugs match Composio toolkit slugs where possible.
"""

CATEGORIES = [
    "AI & ML",
    "Analytics & Data",
    "Calendar & Scheduling",
    "Communication",
    "CRM & Sales",
    "Design & Creative",
    "Developer Tools",
    "E-commerce",
    "File Storage",
    "Finance & Payments",
    "Forms & Surveys",
    "HR & Recruiting",
    "Marketing",
    "Productivity",
    "Project Management",
    "Security & Identity",
    "Social Media",
    "Other",
]

# (slug, name, category, brand_color, popular)
_APPS = [
    ("gmail", "Gmail", "Communication", "#EA4335", True),
    ("googlecalendar", "Google Calendar", "Calendar & Scheduling", "#4285F4", True),
    ("googledrive", "Google Drive", "File Storage", "#1FA463", True),
    ("googlesheets", "Google Sheets", "Productivity", "#0F9D58", True),
    ("slack", "Slack", "Communication", "#4A154B", True),
    ("github", "GitHub", "Developer Tools", "#181717", True),
    ("notion", "Notion", "Productivity", "#000000", True),
    ("linear", "Linear", "Developer Tools", "#5E6AD2", True),
    ("airtable", "Airtable", "Productivity", "#2D7FF9", True),
    ("asana", "Asana", "Project Management", "#F06A6A", True),
    ("calendly", "Calendly", "Calendar & Scheduling", "#006BFF", True),
    ("clickup", "ClickUp", "Project Management", "#7B68EE", True),
    ("dropbox", "Dropbox", "File Storage", "#0061FF", True),
    ("trello", "Trello", "Project Management", "#0079BF", False),
    ("jira", "Jira", "Project Management", "#0052CC", True),
    ("hubspot", "HubSpot", "CRM & Sales", "#FF7A59", True),
    ("salesforce", "Salesforce", "CRM & Sales", "#00A1E0", True),
    ("zendesk", "Zendesk", "CRM & Sales", "#03363D", False),
    ("intercom", "Intercom", "CRM & Sales", "#1F8DED", False),
    ("stripe", "Stripe", "Finance & Payments", "#635BFF", True),
    ("shopify", "Shopify", "E-commerce", "#7AB55C", True),
    ("twilio", "Twilio", "Communication", "#F22F46", False),
    ("discord", "Discord", "Communication", "#5865F2", True),
    ("zoom", "Zoom", "Communication", "#2D8CFF", True),
    ("outlook", "Outlook", "Communication", "#0078D4", True),
    ("microsoft_teams", "Microsoft Teams", "Communication", "#6264A7", True),
    ("typeform", "Typeform", "Forms & Surveys", "#262627", False),
    ("mailchimp", "Mailchimp", "Marketing", "#FFE01B", False),
    ("googledocs", "Google Docs", "Productivity", "#4285F4", False),
    ("googlemeet", "Google Meet", "Communication", "#00897B", False),
]


def base_catalog() -> list[dict]:
    """The curated grid. tools_count/logo may be enriched by Composio later."""
    return [
        {
            "slug": slug,
            "name": name,
            "category": category,
            "color": color,
            "popular": popular,
            "oauth": True,
            "tools_count": None,  # filled from Composio when available
            "logo": None,
        }
        for slug, name, category, color, popular in _APPS
    ]
