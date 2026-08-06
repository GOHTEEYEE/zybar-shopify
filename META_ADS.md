# Meta Ads API (campaign insights)

Pull Facebook / Instagram Ads campaign data into LUNEVA Admin → **Ads**.

## What you need

| Env var | Example | Where |
|--------|---------|--------|
| `META_ADS_ACCESS_TOKEN` | long token string | System User token with `ads_read` |
| `META_AD_ACCOUNT_ID` | `act_1234567890` | Ads Manager → account settings (or bare digits) |
| `META_ADS_API_VERSION` | `v21.0` | Optional |

> This is **separate** from `META_CAPI_ACCESS_TOKEN` (Conversions API / Pixel). CAPI cannot read ads spend.

## Setup (one-time)

### 1. Create / open a Meta App
1. Go to [developers.facebook.com](https://developers.facebook.com/apps/)
2. Create an app (type: **Business**) or open an existing one
3. Add the **Marketing API** product

### 2. Create a System User token (recommended, does not expire as quickly)
1. [business.facebook.com](https://business.facebook.com) → **Business settings**
2. **Users** → **System users** → create (or open) a system user
3. Assign your **Ad account** with at least **View performance** / Ads access
4. **Generate token** → select your app → permission: **`ads_read`**
5. Copy the token → this is `META_ADS_ACCESS_TOKEN`

### 3. Find Ad Account ID
Ads Manager → your account → Account settings, or URL like  
`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1234567890`  
→ `META_AD_ACCOUNT_ID=act_1234567890`

### 4. Add env vars

**Local** (`.env.local` — do not commit):

```bash
META_ADS_ACCESS_TOKEN=EAAB...your_token
META_AD_ACCOUNT_ID=act_1234567890
```

**Production (Vercel):**

```bash
npx vercel env add META_ADS_ACCESS_TOKEN production
npx vercel env add META_AD_ACCOUNT_ID production
```

Then redeploy (`push` or `npx vercel --prod --yes`).

### 5. Verify
Open https://www.zybar.shop/luneva/admin/#ads  
or:

```bash
curl -H "Authorization: Bearer <admin_token>" \
  "https://www.zybar.shop/api/admin/meta-ads/status"
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/admin/meta-ads/status` | Account name / currency / configured? |
| `GET /api/admin/meta-ads/insights?level=campaign&date_preset=7` | Campaign / adset / ad rows + totals |

`date_preset`: `today` · `yesterday` · `7` · `30`  
`level`: `campaign` · `adset` · `ad`

Admin auth required (same Bearer session as other `/api/admin/*` routes).

## Security notes
- Never paste the token into chat or commit it to git
- Prefer a **System User** token over a personal long-lived user token
- Rotate the token if it is ever exposed
