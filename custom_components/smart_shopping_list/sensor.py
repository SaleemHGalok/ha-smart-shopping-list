"""Number of active entries in the shared shopping list."""
from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN, EVENT
from .store import ShoppingStore


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry[ShoppingStore],
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Expose the persisted list count as a sensor."""
    async_add_entities([ActiveItemsSensor(entry.runtime_data)])


class ActiveItemsSensor(SensorEntity):
    """Count list entries, regardless of each entry's quantity."""

    _attr_has_entity_name = True
    _attr_translation_key = "active_items"
    _attr_unique_id = f"{DOMAIN}_active_items"
    _attr_icon = "mdi:cart"
    _attr_should_poll = False
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, store: ShoppingStore) -> None:
        self._store = store

    @property
    def native_value(self) -> int:
        """Return the number of items still to buy."""
        return sum(not item["purchased"] for item in self._store.items)

    async def async_added_to_hass(self) -> None:
        """Listen only while this entity is loaded."""
        await super().async_added_to_hass()
        self.async_on_remove(self.hass.bus.async_listen(EVENT, self._async_list_updated))

    @callback
    def _async_list_updated(self, event: Event) -> None:
        """Publish the count after a successful shopping-list write."""
        self.async_write_ha_state()
