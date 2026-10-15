"""Smart Shopping List integration."""
from pathlib import Path
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.const import Platform
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.exceptions import ConfigEntryNotReady
from .const import DOMAIN
from .store import ShoppingStore
from .websocket import async_register


PLATFORMS = [Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    async_register(hass)
    await hass.http.async_register_static_paths([
        StaticPathConfig("/smart_shopping_list/smart-shopping-card.js",
                       str(Path(__file__).parent / "www" / "smart-shopping-card.js"), False)
    ])
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry[ShoppingStore]) -> bool:
    store = ShoppingStore(hass)
    try:
        await store.async_load()
    except Exception as err:
        raise ConfigEntryNotReady("Unable to load shopping storage") from err
    entry.runtime_data = store
    hass.data[DOMAIN] = store
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry[ShoppingStore]) -> bool:
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    store = hass.data.get(DOMAIN)
    if store is not None:
        await store.async_close()
    hass.data.pop(DOMAIN, None)
    return True
