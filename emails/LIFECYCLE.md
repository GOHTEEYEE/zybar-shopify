# ZYBAR Lifecycle Email Rules

## Will abandoned cart also get Welcome 7-day emails?

**No.** One customer = one active journey at a time.

| Stage | Journey | Trigger | Stops when |
|-------|---------|---------|------------|
| Signup | Welcome (8 emails / 7 days) | Email signup | Add to cart |
| Abandoned / Add to cart | Cart Recovery (8 emails / 7 days) | Add to cart | Purchase |
| Purchased | Purchase / Customer (8 emails / 7 days) | Purchase | 90 days no repurchase → Win Back |

### Flow

1. Person signs up → **Welcome Journey only**
2. Person adds to cart (or is abandoned) → Welcome **stops** → **Cart Journey starts**
3. Person purchases → Cart **stops** → **Purchase Journey starts**

They never receive Welcome + Cart + Purchase emails at the same time.
