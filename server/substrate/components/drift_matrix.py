from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class DriftMatrixComponent(Component):
    type_id = "drift_matrix"
    kind = NodeKind.SUBSCRIBER
    label = "Drift Matrix"
    category = "scoring"
    inputs = []
    outputs = []
    subscribed_streams = []
    config_fields = []
