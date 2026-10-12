"""Serialized, durable shopping list mutations."""
import asyncio
from copy import deepcopy
import math
from uuid import UUID, uuid4
from homeassistant.core import CoreState
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util, json as json_util
from homeassistant.util.file import WriteError
from .const import DOMAIN, EVENT, STORAGE_VERSION


def quantity(value):
    """Reject booleans, strings and non-finite quantities."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Quantity must be a positive number")
    try:
        finite = math.isfinite(value)
    except OverflowError as err:
        raise ValueError("Quantity is too large") from err
    if not finite or value <= 0:
        raise ValueError("Quantity must be a positive finite number")
    return value


def clean_text(value, maximum, optional=False):
    if optional and value is None:
        return None
    if not isinstance(value, str) or len(value.strip()) > maximum:
        raise ValueError(f"Text must contain at most {maximum} characters")
    value = value.strip()
    if not value and not optional:
        raise ValueError("Item name is required")
    return value or None


class StorageWriteError(RuntimeError):
    """A durable storage write could not complete."""


class DurableStore(Store):
    """Surface write failures that the HA Store normally only logs.

    This protected hook is checked against the pinned Home Assistant release.
    Store still owns serialization, atomic file replacement and its write lock.
    """
    async def _async_write_data(self, data):
        try:
            await super()._async_write_data(data)
        except (WriteError, json_util.SerializationError) as err:
            raise StorageWriteError("Could not persist shopping data") from err


class ShoppingStore:
    """Save before publishing; failed writes leave memory untouched."""
    def __init__(self, hass):
        self.hass = hass
        self.storage = DurableStore(hass, STORAGE_VERSION, DOMAIN, atomic_writes=True)
        self.lock = asyncio.Lock()
        self.items = []
        self.revision = 0
        self.closed = False

    async def async_load(self):
        data = await self.storage.async_load()
        if data is not None:
            if not isinstance(data, dict) or not isinstance(data.get("items"), list):
                raise ValueError("Invalid shopping storage")
            seen = set()
            for item in data["items"]:
                item_id = str(UUID(item["id"]))
                if item_id != item["id"] or item_id in seen:
                    raise ValueError("Duplicate or invalid stored item ID")
                seen.add(item_id)
                clean_text(item["name"], 200)
                quantity(item["quantity"])
                clean_text(item.get("unit"), 40, True)
                if not isinstance(item["purchased"], bool):
                    raise ValueError("Invalid purchased flag")
                if dt_util.parse_datetime(item["created_at"]) is None:
                    raise ValueError("Invalid creation timestamp")
                if item["purchased"]:
                    if not item.get("purchased_at") or dt_util.parse_datetime(item["purchased_at"]) is None:
                        raise ValueError("Invalid purchase timestamp")
                elif item.get("purchased_at") is not None:
                    raise ValueError("Active item has a purchase timestamp")
            revision = data.get("revision", 0)
            if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
                raise ValueError("Invalid stored revision")
            self.items = data["items"]
            self.revision = revision

    async def async_close(self):
        """Drain writes before unloading; reject queued stale commands."""
        async with self.lock:
            self.closed = True

    def snapshot(self):
        return {"items": deepcopy(self.items), "revision": self.revision}

    async def mutate(self, action, **values):
        async with self.lock:
            if self.closed or self.hass.state is CoreState.stopping:
                raise ValueError("Shopping list was unloaded; reconnect and retry")
            items = deepcopy(self.items)
            now = dt_util.utcnow().isoformat()
            if action == "clear_history":
                items = [item for item in items if not item["purchased"]]
                if len(items) == len(self.items):
                    return self.snapshot()
            elif action == "add":
                items.append({"id": str(uuid4()), "name": clean_text(values["name"], 200),
                              "quantity": quantity(values["quantity"]),
                              "unit": clean_text(values.get("unit"), 40, True),
                              "purchased": False, "created_at": now, "purchased_at": None})
            else:
                try:
                    item_id = str(UUID(values["item_id"]))
                except (ValueError, TypeError, AttributeError) as err:
                    raise ValueError("Invalid item ID") from err
                item = next((i for i in items if i["id"] == item_id), None)
                if item is None:
                    raise LookupError("Item no longer exists")
                if action == "edit":
                    item["quantity"] = quantity(values["quantity"])
                elif action == "delete":
                    items.remove(item)
                elif action in ("purchase", "restore"):
                    purchased = action == "purchase"
                    if item["purchased"] == purchased:
                        return self.snapshot()
                    item.update(purchased=purchased, purchased_at=now if purchased else None)
                else:
                    raise ValueError("Unknown action")
            data = {"items": items, "revision": self.revision + 1}
            await self.storage.async_save(data)
            self.items, self.revision = items, data["revision"]
            self.hass.bus.async_fire(EVENT, self.snapshot())
            return self.snapshot()
