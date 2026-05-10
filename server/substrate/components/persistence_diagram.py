from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class PersistenceDiagramComponent(Component):
    type_id = "persistence_diagram"
    kind = NodeKind.SUBSCRIBER
    label = "Persistence Diagram"
    category = "topology"
    inputs = []
    outputs = []
    subscribed_streams = ["topoconf:scoring:persistence_computed"]
    config_fields = []
