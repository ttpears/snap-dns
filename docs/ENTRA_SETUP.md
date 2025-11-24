# Azure AD / Entra ID Role Mapping Configuration Guide

## Overview

Snap DNS uses Azure AD App Roles to determine user permissions when logging in via SSO. This guide shows you how to configure role assignments in the Azure Portal.

## Role Mapping

| Azure AD App Role | Snap DNS Role | Permissions |
|-------------------|---------------|-------------|
| `admin` | Admin | Full access - manage users, keys, DNS, settings, audit logs |
| `editor` | Editor | Manage DNS records, snapshots |
| None or `viewer` | Viewer | Read-only access to zones |

---

## Step 1: Create App Roles in Azure AD

### 1.1 Navigate to Your App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** (or **Microsoft Entra ID**)
3. Click **App registrations**
4. Find and click your **Snap DNS** application

### 1.2 Create App Roles

1. In your app registration, click **App roles** in the left menu
2. Click **+ Create app role**

#### Create the "admin" Role

```
Display name: DNS Administrator
Allowed member types: Users/Groups
Value: admin
Description: Full access to DNS management, user management, and system settings
Do you want to enable this app role? ✓ Checked
```

Click **Apply**

#### Create the "editor" Role

```
Display name: DNS Editor
Allowed member types: Users/Groups
Value: editor
Description: Can create, modify, and delete DNS records
Do you want to enable this app role? ✓ Checked
```

Click **Apply**

#### Optional: Create the "viewer" Role

```
Display name: DNS Viewer
Allowed member types: Users/Groups
Value: viewer
Description: Read-only access to DNS records
Do you want to enable this app role? ✓ Checked
```

Click **Apply**

> **Note:** The `viewer` role is optional. Users without any assigned role will default to viewer permissions.

---

## Step 2: Assign Users/Groups to Roles

### Option A: Assign Individual Users

1. Go to **Azure Active Directory** > **Enterprise applications**
2. Find and click your **Snap DNS** application (it will have the same name as your App Registration)
3. Click **Users and groups** in the left menu
4. Click **+ Add user/group**
5. Click **Users** and select the user(s) you want to assign
6. Click **Select a role**
7. Choose the appropriate role:
   - **DNS Administrator** (full access)
   - **DNS Editor** (manage DNS only)
   - **DNS Viewer** (read-only)
8. Click **Assign**

### Option B: Assign Security Groups (Recommended for Large Teams)

1. Create Azure AD Security Groups for each role:
   - `DNS-Admins`
   - `DNS-Editors`
   - `DNS-Viewers`

2. Add users to the appropriate groups

3. In your Snap DNS Enterprise Application:
   - Go to **Users and groups**
   - Click **+ Add user/group**
   - Click **Groups** and select your group (e.g., `DNS-Admins`)
   - Click **Select a role** and choose **DNS Administrator**
   - Click **Assign**

4. Repeat for each group

> **⚠️ Important:** Your Azure AD license must support group-based assignment for this to work. This requires Azure AD Premium P1 or P2.

---

## Step 3: Enable App Roles in Token

### 3.1 Configure Token Claims

1. In your **App registration**, click **Token configuration** in the left menu
2. Click **+ Add groups claim**
3. Select:
   - ✓ **Security groups**
   - ✓ **Groups assigned to the application** (recommended)
4. Under **Customize token properties by type**, ensure **ID** is checked for **Group ID**
5. Click **Add**

### 3.2 Add Optional Claims (If Needed)

If roles aren't appearing in tokens:

1. Click **Token configuration** > **+ Add optional claim**
2. Select **ID** token type
3. Check **roles** in the list
4. Click **Add**

---

## Step 4: Test Role Assignment

### 4.1 Login and Verify

1. Have a test user sign in to Snap DNS via SSO
2. Check their role in the UI (top-right corner, user menu)
3. Verify permissions:
   - **Admin**: Can access Settings > Users and Settings > Audit Logs
   - **Editor**: Can modify DNS records, create snapshots
   - **Viewer**: Can only view, no edit/delete buttons

### 4.2 Check Backend Logs

```bash
docker logs snap-dns-test-backend | grep "SSO login successful"
```

Should show:
```
SSO login successful: user@domain.com (admin)
```

### 4.3 Verify JWT Token (Advanced)

To debug role claims, decode the JWT token:

1. Open browser DevTools (F12)
2. Go to **Application** > **Cookies**
3. Find the session cookie
4. Or check the Network tab during login

The ID token should contain:
```json
{
  "roles": ["admin"],
  "preferred_username": "user@domain.com",
  ...
}
```

---

## Troubleshooting

### Users Always Get "Viewer" Role

**Cause:** App roles not included in JWT token

**Solutions:**
1. Verify users/groups are assigned to roles in Enterprise Application
2. Check Token Configuration includes roles claim
3. Ensure app roles **Value** field exactly matches: `admin`, `editor`, or `viewer`
4. Wait 5-10 minutes for Azure AD to propagate changes
5. Have users sign out and sign back in (old tokens are cached)

### "DNS Administrator" Role Not Working

**Cause:** Role value doesn't match expected value

**Fix:**
- Role **Value** must be exactly `admin` (lowercase)
- Role **Display name** can be anything (e.g., "DNS Administrator")

### Groups Not Showing in Token

**Cause:** Azure AD license limitation

**Fix:**
- Use direct user assignment instead of groups
- OR upgrade to Azure AD Premium P1/P2

### Users Can't See Role in Token

**Debug Steps:**
```bash
# Check audit logs
curl -s https://snap-dns-testing-api.teamgleim.com/api/audit?eventType=auth.login.success \
  -H "Cookie: snap-dns.sid=YOUR_SESSION_ID" | jq

# Look for "details" field showing role assignment
```

---

## Quick Reference: App Role Values

| Display Name | Value (MUST BE EXACT) | Case Sensitive? |
|--------------|----------------------|-----------------|
| DNS Administrator | `admin` | ✓ Yes (lowercase) |
| DNS Editor | `editor` | ✓ Yes (lowercase) |
| DNS Viewer | `viewer` | ✓ Yes (lowercase) |

---

## Best Practices

### 1. Use Security Groups
Create groups like `DNS-Admins`, `DNS-Editors`, and assign roles to groups rather than individual users.

### 2. Limit Admin Role
Only assign `admin` role to IT administrators who need to manage users and system settings.

### 3. Default to Viewer
Leave some users unassigned - they'll automatically get viewer access.

### 4. Test Before Production
Always test role assignments with a few users before rolling out to the entire organization.

### 5. Document Assignments
Keep a record of which groups/users have which roles for security audits.

---

## Azure AD Conditional Access (Optional)

You can add additional security with Conditional Access policies:

1. Go to **Azure AD** > **Security** > **Conditional Access**
2. Create a new policy
3. **Users**: Select your Snap DNS groups
4. **Cloud apps**: Select your Snap DNS app
5. **Conditions**: Require MFA, specific locations, compliant devices, etc.
6. **Access controls**: Grant access with MFA

This adds an extra layer of security beyond role-based access.

---

## Support & References

- **Snap DNS Config**: Settings > SSO Configuration
- **Azure AD Docs**: https://learn.microsoft.com/en-us/azure/active-directory/develop/howto-add-app-roles-in-azure-ad-apps
- **App Roles**: https://learn.microsoft.com/en-us/azure/active-directory/develop/howto-add-app-roles-in-apps
- **Group Claims**: https://learn.microsoft.com/en-us/azure/active-directory/develop/active-directory-optional-claims

---

## Need Help?

If role mapping isn't working:

1. Check the **Audit Logs** tab in Snap DNS Settings (admin only)
2. Look for login events - they show the assigned role
3. Check Azure AD Enterprise Application > **Users and groups** to verify assignments
4. Ensure role **Values** exactly match: `admin`, `editor`, `viewer`
