from substrate.registry import registry
from substrate.sdk import Component, NodeKind, Socket, SocketType


@registry.register
class FeatureBarsComponent(Component):
    type_id = "feature_bars"
    kind = NodeKind.SUBSCRIBER
    label = "Feature Bars"
    category = "topology"
    inputs = [Socket("features_in", SocketType.FEATURES, "Features")]
    outputs = []
    subscribed_streams = ["topoconf:scoring:features_computed"]
    config_fields = []
