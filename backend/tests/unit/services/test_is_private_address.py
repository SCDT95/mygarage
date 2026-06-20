"""Unit tests for LiveLinkService.is_private_address SSRF validator.

Tests cover:
- Literal private IPs (ACCEPT)
- Literal public / loopback / link-local / reserved / unspecified IPs (REJECT)
- IPv6 literals including bracket form (REJECT where appropriate)
- Bare hostnames with mocked DNS (ACCEPT private, REJECT public, REJECT gaierror)
"""

import socket
from unittest.mock import patch

import pytest

from app.services.livelink_service import LiveLinkService


def _ipa(addr: str) -> tuple:
    """Build a minimal getaddrinfo 5-tuple for a given IP string."""
    return (socket.AF_INET, socket.SOCK_STREAM, 0, "", (addr, 0))


# ---------------------------------------------------------------------------
# Literal IPs — no DNS involved
# ---------------------------------------------------------------------------


class TestAcceptPrivateLiteralIPs:
    """RFC-1918 addresses and full URLs pointing at them should be ACCEPTED."""

    @pytest.mark.parametrize(
        "address",
        [
            "10.0.0.5",
            "192.168.1.1",
            "172.16.0.1",
            "http://10.10.20.244:80/obd_logs",
        ],
    )
    def test_private_ip_accepted(self, address: str) -> None:
        assert LiveLinkService.is_private_address(address) is True


class TestRejectLiteralIPs:
    """Public IPs, loopback, link-local, reserved, unspecified must be REJECTED."""

    @pytest.mark.parametrize(
        "address",
        [
            "8.8.8.8",
            "1.1.1.1",
            "127.0.0.1",
            "::1",
            "http://[::1]/x",
            "169.254.1.1",
            "fe80::1",
            "localhost",
            "",
            "0.0.0.0",
        ],
    )
    def test_rejected(self, address: str) -> None:
        assert LiveLinkService.is_private_address(address) is False


# ---------------------------------------------------------------------------
# Hostname resolution (mocked — no real DNS)
# ---------------------------------------------------------------------------


class TestHostnameResolution:
    """Non-IP hostnames are resolved; all results must be private to ACCEPT."""

    def test_hostname_resolving_to_private_ip_accepted(self) -> None:
        infos = [_ipa("10.0.0.9")]
        with patch("app.services.livelink_service.socket.getaddrinfo", return_value=infos):
            assert LiveLinkService.is_private_address("wican-abc123.local") is True

    def test_hostname_resolving_to_public_ip_rejected(self) -> None:
        infos = [_ipa("93.184.216.34")]
        with patch("app.services.livelink_service.socket.getaddrinfo", return_value=infos):
            assert LiveLinkService.is_private_address("example.com") is False

    def test_hostname_dns_failure_rejected(self) -> None:
        with patch(
            "app.services.livelink_service.socket.getaddrinfo",
            side_effect=socket.gaierror("Name or service not known"),
        ):
            assert LiveLinkService.is_private_address("nonexistent.invalid") is False

    def test_hostname_mixed_results_rejected(self) -> None:
        """If even one resolved address is public the whole check fails."""
        infos = [_ipa("10.0.0.1"), _ipa("93.184.216.34")]
        with patch("app.services.livelink_service.socket.getaddrinfo", return_value=infos):
            assert LiveLinkService.is_private_address("split-horizon.example") is False

    def test_hostname_empty_resolution_rejected(self) -> None:
        """Empty getaddrinfo result set → REJECT (no confirmed private target)."""
        with patch("app.services.livelink_service.socket.getaddrinfo", return_value=[]):
            assert LiveLinkService.is_private_address("empty.local") is False
