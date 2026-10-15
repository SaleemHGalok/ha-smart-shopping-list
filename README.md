# Smart Shopping List

A shared shopping list for Home Assistant, with a custom dashboard card for planning at home and checking off items at the store. Add an item on one device and see it update on your other dashboards.

- Add items with a quantity and optional unit.
- Edit quantities and delete items with confirmation.
- Tap **Got It** while shopping to move an item into purchase history.
- Restore purchased items or clear history with confirmation.
- Use separate cards for each view, or switch between Manage and Store in one card.
- Fits phone, tablet and desktop dashboards, with Home Assistant light/dark theme support.

## Before you start

You need **Home Assistant 2026.10.1 or newer** and **HACS** installed. The integration and card are included in one download. No build tools or additional custom cards are required.

## Install with HACS

1. Open **HACS** in Home Assistant.
2. Select **⋮ → Custom repositories**.
3. Enter `https://github.com/SaleemHGalok/ha-smart-shopping-list`.
4. Choose **Integration** as the type, then select **Add**.
5. Find **Smart Shopping List** in HACS and download it.
6. **Restart Home Assistant**.

HACS requires this GitHub repository to be public. If the repository is private, use the manual installation instructions below.

## Set up the integration

After restarting, open **Settings → Devices & services → Add integration**, search for **Smart Shopping List**, and complete the setup form.

The integration creates one shared household list. All signed-in Home Assistant users can view and change it, and every Smart Shopping List card uses the same data.

## Register the dashboard card

1. Enable **Advanced Mode** in your Home Assistant user profile if the Resources menu is hidden.
2. Open **Settings → Dashboards → ⋮ → Resources**.
3. Select **Add resource** and enter:

   | Setting | Value |
   | --- | --- |
   | URL | `/smart_shopping_list/smart-shopping-card.js?v=1.0.0` |
   | Resource type | **JavaScript module** |

4. Refresh your browser or Home Assistant app.

Register this resource once, even if you use several cards or dashboards.

## Add your first card

Edit a dashboard, select **Add card → Manual**, and paste:

```yaml
type: custom:smart-shopping-card
title: Shopping list
mode: multi
```

This starts in **Manage** so you can prepare your list. Tap **Store mode** when you start shopping, then **Back to manage mode** to return.

The selected view applies only to that card. Refreshing the page starts it in Manage again; your shopping items are saved.

## Choose a card mode

| Mode | What it shows |
| --- | --- |
| `multi` | Manage and Store views with a button to switch between them. Starts in Manage. |
| `manage` | Active items with Add Item, Edit quantity and Delete actions. |
| `store` | Active items with a large Got It button. Purchased items disappear from this view. |
| `history` | Purchased items with Restore and Clear History actions. |

`title` is optional. If you omit `mode`, the card uses `manage`. Multi mode does not include history; use a separate history card when needed.

For example, you can keep these fixed cards on separate dashboards:

```yaml
type: custom:smart-shopping-card
title: Prepare my list
mode: manage
```

```yaml
type: custom:smart-shopping-card
title: At the store
mode: store
```

```yaml
type: custom:smart-shopping-card
title: Purchase history
mode: history
```

All cards stay synchronized. **Got It** keeps the item in history, and **Restore** brings it back to the active list. **Delete** and **Clear History** permanently remove data after confirmation. Clearing history keeps active shopping items.

## Show the number of items on your dashboard

The integration adds **Smart Shopping List active items**, normally named `sensor.smart_shopping_list_active_items`. It counts active entries still to buy: milk with quantity 3 counts as one entry. Purchased items are excluded.

Add a Tile card with the entity picker, or use:

```yaml
type: tile
entity: sensor.smart_shopping_list_active_items
name: Items to buy
icon: mdi:cart
```

You can also use the sensor in a dashboard badge, template or automation:

```jinja
{{ states('sensor.smart_shopping_list_active_items') | int(0) }}
```

The count updates when items are added, deleted, purchased or restored, and loads from your saved list after a restart. Quantity changes do not change the count. After updating an existing installation, restart Home Assistant to create the sensor. If you renamed the entity or Home Assistant assigned another ID, select its actual ID under **Settings → Devices & services → Smart Shopping List → Entities**.

## Update through HACS

Download the update in HACS and restart Home Assistant. Then change the resource's query value, for example from `?v=1.0.0` to `?v=2`, and refresh each browser or app to load the updated card. Edit the existing resource rather than adding another copy.

Your list is stored locally in Home Assistant and persists across restarts. Include your Home Assistant configuration in your regular backups.

## Manual installation

Copy the `custom_components/smart_shopping_list` folder, including its `www` folder, into `/config/custom_components/` on your Home Assistant server. Restart Home Assistant, then follow **Set up the integration** and **Register the dashboard card** above.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| HACS cannot add the repository | Use the repository URL above, select Integration, and confirm the repository is public. |
| Integration is missing from Add integration | Restart Home Assistant, check your HA version, and look under Settings → System → Logs. |
| “Custom element doesn't exist: smart-shopping-card” | Check the resource URL and JavaScript module type, then refresh with a new query value. |
| “Set up Smart Shopping List first” | Add the integration under Devices & services, then select Retry connection on the card. |
| Old card appearance after an update | Change the resource query value and refresh the browser/app cache. |
| Items do not save | Check Home Assistant logs, available disk space and storage permissions. The card retains form input after a failed save so you can retry. |

For bugs or feature requests, [open an issue](https://github.com/SaleemHGalok/ha-smart-shopping-list/issues). Include your Home Assistant version, card mode and relevant error message; remove credentials from any logs you share.

Contributing? Build instructions, Docker development, tests and API details are in the [development guide](docs/DEVELOPMENT.md).
