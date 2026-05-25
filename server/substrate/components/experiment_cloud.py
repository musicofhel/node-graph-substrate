from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class ExperimentCloudComponent(Component):
    type_id = "experiment_cloud"
    kind = NodeKind.SUBSCRIBER
    label = "Experiment Cloud"
    category = "experiment"
    inputs = []
    outputs = []
    subscribed_streams = []
    config_fields = []
