import pytest

@pytest.fixture(autouse=True)
def enable_integrations(enable_custom_integrations):
    """Permit loading the repository integration."""
