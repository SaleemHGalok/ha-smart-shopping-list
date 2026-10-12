from homeassistant import config_entries
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from custom_components.smart_shopping_list.const import DOMAIN

async def test_config_flow(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "form"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["reason"] == "already_configured"

async def test_websocket_sync_and_validation(hass, hass_ws_client):
    assert await async_setup_component(hass, "websocket_api", {})
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    first = await hass_ws_client(hass)
    second = await hass_ws_client(hass)
    await second.send_json({"id": 1, "type": f"{DOMAIN}/subscribe"})
    assert (await second.receive_json())["success"]
    assert (await second.receive_json())["event"]["items"] == []
    await first.send_json({"id": 1, "type": f"{DOMAIN}/command", "action": "add", "name": "Milk", "quantity": 1})
    result = await first.receive_json()
    assert result["success"]
    event = await second.receive_json()
    assert event["event"] == result["result"]
    await first.send_json({"id": 2, "type": f"{DOMAIN}/command", "action": "edit", "item_id": result["result"]["items"][0]["id"], "quantity": 2, "name": "Forbidden"})
    assert not (await first.receive_json())["success"]
    await second.send_json({"id": 2, "type": "unsubscribe_events", "subscription": 1})
    assert (await second.receive_json())["success"]
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert hass.data[DOMAIN].items[0]["name"] == "Milk"

async def test_clear_history_websocket(hass, hass_ws_client):
    assert await async_setup_component(hass, "websocket_api", {})
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    store = hass.data[DOMAIN]
    active = (await store.mutate("add", name="Keep", quantity=1))["items"][0]
    purchased = (await store.mutate("add", name="Clear", quantity=1))["items"][1]
    await store.mutate("purchase", item_id=purchased["id"])
    first = await hass_ws_client(hass)
    second = await hass_ws_client(hass)
    await second.send_json({"id": 1, "type": f"{DOMAIN}/subscribe"})
    assert (await second.receive_json())["success"]
    assert len((await second.receive_json())["event"]["items"]) == 2
    await first.send_json({"id": 1, "type": f"{DOMAIN}/command", "action": "clear_history"})
    result = await first.receive_json()
    assert result["success"] and result["result"]["items"] == [active]
    assert (await second.receive_json())["event"] == result["result"]
    await first.send_json({"id": 2, "type": f"{DOMAIN}/command", "action": "clear_history", "item_id": active["id"]})
    assert not (await first.receive_json())["success"]
