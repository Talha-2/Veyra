from __future__ import annotations

import httpx
import pytest

from app_sdk import AppSdk, NotFound


def document(slug="procedure"):
    return {"slug": slug, "name": "Procedure", "description": "Procedure", "version": 1, "markdown": "PRIVATE INSTRUCTIONS"}


async def test_cached_shared_body_is_not_returned_after_skill_becomes_private():
    count = 0

    def serve(request):
        nonlocal count
        count += 1
        return httpx.Response(200, json=document()) if count == 1 else httpx.Response(404, json={"message": "Not found"})

    async with AppSdk("http://app.test", "secret", organization_id=1, transport=httpx.MockTransport(serve)) as sdk:
        await sdk.skill("procedure")
        with pytest.raises(NotFound):
            await sdk.skill("procedure")
    assert count == 2


async def test_expert_skill_client_uses_fixed_paths_and_separate_identity_and_cache():
    paths = []

    def serve(request):
        paths.append(request.url.path)
        if "/experts/billing/skills/private" in request.url.path:
            return httpx.Response(200, json=document("private"))
        return httpx.Response(404, json={"message": "Not found"})

    async with AppSdk("http://app.test", "secret", organization_id=1, transport=httpx.MockTransport(serve)) as sdk:
        expert = sdk.for_expert("billing")
        assert (await expert.skill("private")).markdown == "PRIVATE INSTRUCTIONS"
        with pytest.raises(NotFound):
            await sdk.skill("private")
        with pytest.raises(NotFound):
            await expert.for_organization(2).skill("private")
    assert paths == ["/api/agent/v1/organizations/1/experts/billing/skills/private", "/api/agent/v1/organizations/1/skills/private", "/api/agent/v1/organizations/2/skills/private"]
