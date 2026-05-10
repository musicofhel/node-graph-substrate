from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class ResearchCoordinatorComponent(Component):
    type_id = "research_coordinator"
    kind = NodeKind.SUBSCRIBER
    label = "Research Coordinator"
    category = "scoring"
    inputs = []
    outputs = []
    subscribed_streams = [
        "topoconf:research:triaged",
        "topoconf:research:script_generated",
        "topoconf:research:experiment_started",
        "topoconf:research:experiment_completed",
        "topoconf:research:promoted",
    ]
    config_fields = []
