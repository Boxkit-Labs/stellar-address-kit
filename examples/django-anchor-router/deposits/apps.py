"""
deposits/apps.py
AppConfig for the deposits Django application.
"""
from django.apps import AppConfig


class DepositsConfig(AppConfig):
    """Configuration for the deposits app.

    This app handles Stellar deposit routing logic.  It deliberately contains
    no Web3 dependencies; all address classification is done through the
    stellar-address-kit (STA) pure-Python helpers.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "deposits"
    verbose_name = "Stellar Deposits"
