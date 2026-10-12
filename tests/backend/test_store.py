import asyncio
from unittest.mock import AsyncMock
import pytest
from custom_components.smart_shopping_list.store import ShoppingStore
from custom_components.smart_shopping_list.const import EVENT

async def test_lifecycle_persistence_and_events(hass):
    store = ShoppingStore(hass)
    await store.async_load()
    events = []
    unsub = hass.bus.async_listen(EVENT, lambda event: events.append(event.data))
    data = await store.mutate("add", name=" Milk ", quantity=1.5, unit=" L ")
    item = data["items"][0]
    assert item["name"] == "Milk" and item["unit"] == "L"
    assert item["created_at"] and item["purchased_at"] is None
    await store.mutate("edit", item_id=item["id"], quantity=3)
    await store.mutate("purchase", item_id=item["id"])
    assert store.items[0]["purchased_at"]
    reloaded = ShoppingStore(hass)
    await reloaded.async_load()
    assert reloaded.snapshot() == store.snapshot()
    await store.mutate("restore", item_id=item["id"])
    assert not store.items[0]["purchased"] and store.items[0]["purchased_at"] is None
    await store.mutate("delete", item_id=item["id"])
    await hass.async_block_till_done()
    assert not store.items and len(events) == 5
    unsub()

async def test_concurrent_writes(hass):
    store = ShoppingStore(hass)
    await asyncio.gather(*(store.mutate("add", name=str(i), quantity=1) for i in range(20)))
    reloaded = ShoppingStore(hass)
    await reloaded.async_load()
    assert len(reloaded.items) == 20 and reloaded.revision == 20
    assert len({i["id"] for i in reloaded.items}) == 20

@pytest.mark.parametrize("value", [0, -1, True, "1", float("nan"), float("inf")])
async def test_bad_quantities(hass, value):
    store = ShoppingStore(hass)
    with pytest.raises(ValueError):
        await store.mutate("add", name="Milk", quantity=value)
    assert not store.items

@pytest.mark.parametrize("name", ["", "  ", "x" * 201, None])
async def test_bad_names(hass, name):
    with pytest.raises(ValueError):
        await ShoppingStore(hass).mutate("add", name=name, quantity=1)

async def test_write_failure_rolls_back(hass):
    store = ShoppingStore(hass)
    store.storage.async_save = AsyncMock(side_effect=OSError("disk full"))
    with pytest.raises(OSError):
        await store.mutate("add", name="Milk", quantity=1)
    assert store.snapshot() == {"items": [], "revision": 0}

async def test_missing_id_and_snapshot_isolation(hass):
    store = ShoppingStore(hass)
    result = await store.mutate("add", name="Milk", quantity=1)
    result["items"].clear()
    assert len(store.items) == 1
    with pytest.raises(ValueError):
        await store.mutate("delete", item_id="bad")
    with pytest.raises(LookupError):
        await store.mutate("delete", item_id="00000000-0000-0000-0000-000000000000")

async def test_closed_store_rejects_queued_commands(hass):
    store = ShoppingStore(hass)
    await store.async_close()
    with pytest.raises(ValueError, match="unloaded"):
        await store.mutate("add", name="Milk", quantity=1)

async def test_corrupt_storage_is_not_overwritten(hass):
    store = ShoppingStore(hass)
    store.storage.async_load = AsyncMock(return_value={"items": "corrupt"})
    store.storage.async_save = AsyncMock()
    with pytest.raises(ValueError, match="storage"):
        await store.async_load()
    store.storage.async_save.assert_not_awaited()

async def test_purchase_idempotent_and_invalid_unit(hass):
    store = ShoppingStore(hass)
    result = await store.mutate("add", name="Milk", quantity=1)
    item_id = result["items"][0]["id"]
    first = await store.mutate("purchase", item_id=item_id)
    second = await store.mutate("purchase", item_id=item_id)
    assert first == second
    with pytest.raises(ValueError):
        await store.mutate("add", name="Milk", quantity=1, unit="x" * 41)

async def test_real_store_write_error_does_not_publish(hass):
    from unittest.mock import patch
    from homeassistant.util.file import WriteError
    from custom_components.smart_shopping_list.store import StorageWriteError
    store = ShoppingStore(hass)
    events = []
    unsub = hass.bus.async_listen(EVENT, lambda event: events.append(event))
    with patch("homeassistant.helpers.storage.write_utf8_file_atomic", side_effect=WriteError("disk full")):
        with pytest.raises(StorageWriteError):
            await store.mutate("add", name="Milk", quantity=1)
    await hass.async_block_till_done()
    assert store.snapshot() == {"items": [], "revision": 0}
    assert events == []
    unsub()
