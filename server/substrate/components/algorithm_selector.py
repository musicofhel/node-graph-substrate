from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class AlgorithmSelectorComponent(Component):
    type_id = "algorithm_selector"
    kind = NodeKind.SUBSCRIBER
    label = "Algorithm Selector"
    category = "experiment"
    inputs = []
    outputs = []
    subscribed_streams = []
    config_fields = []
