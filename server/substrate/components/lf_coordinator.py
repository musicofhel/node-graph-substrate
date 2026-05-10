from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class LfCoordinatorComponent(Component):
    type_id = "lf_coordinator"
    kind = NodeKind.SUBSCRIBER
    label = "Pipeline Coordinator"
    category = "input"
    inputs = []
    outputs = []
    subscribed_streams = [
        "linkforge:ingested",
        "linkforge:extracted",
        "linkforge:categorized",
        "linkforge:embedded",
        "linkforge:stored",
        "linkforge:chunked",
        "linkforge:auto_related",
        "linkforge:research_bridged",
        "linkforge:url_discovered",
        "linkforge:completed",
    ]
    config_fields = []
