"""Exercise the count sensor through Home Assistant's entity platform."""
from unittest.mock import AsyncMock

import pytest
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.smart_shopping_list.const import DOMAIN
from custom_components.smart_shopping_list.store import ShoppingStore

ENTITY = "sensor.smart_shopping_list_active_items"


async def setup_sensor(hass):
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, entry.runtime_data


async def test_count_tracks_list_mutations(hass):
    entry, store = await setup_sensor(hass)

    async def assert_count(expected):
        await hass.async_block_till_done()
        assert hass.states.get(ENTITY).state == str(expected)

    await assert_count(0)
    milk = (await store.mutate("add", name="Milk", quantity=3))["items"][0]
    await assert_count(1)
    bread = (await store.mutate("add", name="Bread", quantity=1))["items"][1]
    await assert_count(2)
    await store.mutate("edit", item_id=milk["id"], quantity=10)
    await assert_count(2)
    await store.mutate("purchase", item_id=milk["id"])
    await assert_count(1)
    await store.mutate("restore", item_id=milk["id"])
    await assert_count(2)
    await store.mutate("delete", item_id=bread["id"])
    await assert_count(1)
    await store.mutate("purchase", item_id=milk["id"])
    await assert_count(0)
    await store.mutate("clear_history")
    await assert_count(0)
    registry_entry = er.async_get(hass).async_get(ENTITY)
    assert registry_entry.unique_id == f"{DOMAIN}_active_items"
    assert registry_entry.config_entry_id == entry.entry_id


async def test_count_loads_from_persistence_and_reloads(hass):
    saved = ShoppingStore(hass)
    await saved.mutate("add", name="Keep", quantity=20)
    result = await saved.mutate("add", name="Purchased", quantity=1)
    await saved.mutate("purchase", item_id=result["items"][1]["id"])
    entry, store = await setup_sensor(hass)
    assert hass.states.get(ENTITY).state == "1"
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    state = hass.states.get(ENTITY)
    assert state is None or state.state == "unavailable"
    assert not hass.bus.async_listeners().get(f"{DOMAIN}_updated", 0)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get(ENTITY).state == "1"
    await entry.runtime_data.mutate("add", name="New", quantity=1)
    await hass.async_block_till_done()
    assert hass.states.get(ENTITY).state == "2"


async def test_failed_write_does_not_change_count(hass):
    entry, store = await setup_sensor(hass)
    store.storage.async_save = AsyncMock(side_effect=OSError("disk full"))
    with pytest.raises(OSError):
        await store.mutate("add", name="Milk", quantity=1)
    await hass.async_block_till_done()
    assert hass.states.get(ENTITY).state == "0"
