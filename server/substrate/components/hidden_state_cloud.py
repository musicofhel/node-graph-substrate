from substrate.registry import registry
from substrate.sdk import Component, NodeKind, Socket, SocketType


@registry.register
class HiddenStateCloudComponent(Component):
    type_id = "hidden_state_cloud"
    kind = NodeKind.SUBSCRIBER
    label = "Hidden State Cloud"
    category = "extraction"
    inputs = []
    outputs = []
    subscribed_streams = ["topoconf:scoring:hidden_state_cloud"]
    config_fields = []
