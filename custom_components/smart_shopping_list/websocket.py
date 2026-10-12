"""Authenticated commands and atomic snapshot subscriptions."""
import logging
import probatio
from homeassistant.components import websocket_api
from homeassistant.core import callback
from .const import DOMAIN, EVENT

_LOGGER = logging.getLogger(__name__)


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def subscribe(hass, connection, msg):
    store = hass.data.get(DOMAIN)
    if store is None:
        connection.send_error(msg["id"], "not_loaded", "Set up Smart Shopping List first")
        return
    @callback
    def changed(event):
        connection.send_event(msg["id"], event.data)
    connection.subscriptions[msg["id"]] = hass.bus.async_listen(EVENT, changed)
    connection.send_result(msg["id"])
    connection.send_event(msg["id"], store.snapshot())


@websocket_api.websocket_command({
    probatio.Required("type"): f"{DOMAIN}/command",
    probatio.Required("action"): probatio.In(["get", "add", "edit", "delete", "purchase", "restore"]),
    probatio.Optional("item_id"): str,
    probatio.Optional("name"): str,
    probatio.Optional("quantity"): probatio.Any(int, float),
    probatio.Optional("unit"): probatio.Any(str, None),
})
@websocket_api.async_response
async def command(hass, connection, msg):
    store = hass.data.get(DOMAIN)
    if store is None:
        connection.send_error(msg["id"], "not_loaded", "Set up Smart Shopping List first")
        return
    action = msg["action"]
    fields = {k: v for k, v in msg.items() if k not in ("id", "type", "action")}
    expected = {"get": set(), "add": {"name", "quantity", "unit"},
                "edit": {"item_id", "quantity"}, "delete": {"item_id"},
                "purchase": {"item_id"}, "restore": {"item_id"}}[action]
    required = expected - ({"unit"} if action == "add" else set())
    if not required <= fields.keys() or not fields.keys() <= expected:
        connection.send_error(msg["id"], "invalid_input", "Invalid fields for action")
        return
    try:
        result = store.snapshot() if action == "get" else await store.mutate(action, **fields)
    except (ValueError, LookupError) as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
    except Exception:
        _LOGGER.exception("Shopping list write failed")
        connection.send_error(msg["id"], "storage_error", "Could not save shopping list")
    else:
        connection.send_result(msg["id"], result)


@callback
def async_register(hass):
    websocket_api.async_register_command(hass, subscribe)
    websocket_api.async_register_command(hass, command)
