import sys
import types
import unittest
from unittest.mock import AsyncMock, patch

from sqlmodel import Session, create_engine

from app.experts import harness
from app.experts.models import Expert


class ExpertHarnessTests(unittest.IsolatedAsyncioTestCase):
    async def test_build_agent_compiles_expert_prompt_and_shared_runtime(self):
        captured = {}

        def fake_create_deep_agent(**kwargs):
            captured.update(kwargs)
            return object()

        fake_deepagents = types.SimpleNamespace(create_deep_agent=fake_create_deep_agent)
        engine = create_engine("sqlite://")
        expert = Expert(
            id="exp_test",
            name="Support agent",
            system_prompt="Answer from the business knowledge base.",
            reasoning="fast",
        )

        with (
            patch.dict(sys.modules, {"deepagents": fake_deepagents}),
            patch.object(harness, "_langchain_tools", return_value=["tool"]),
            patch.object(harness, "_checkpointer", new=AsyncMock(return_value="checkpointer")),
            patch("app.llm.langchain_model", return_value="model") as model,
        ):
            with Session(engine) as session:
                agent = await harness.build_agent(
                    session,
                    expert,
                    "Keep website replies concise.",
                )

        self.assertIsNotNone(agent)
        self.assertEqual(captured["model"], "model")
        self.assertEqual(captured["tools"], ["tool"])
        self.assertEqual(captured["checkpointer"], "checkpointer")
        self.assertIn(expert.system_prompt, captured["system_prompt"])
        self.assertIn("Keep website replies concise.", captured["system_prompt"])
        model.assert_called_once_with(temperature=0.3)


if __name__ == "__main__":
    unittest.main()
