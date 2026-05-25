from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class ExperimentROIComponent(Component):
    type_id = "experiment_roi"
    kind = NodeKind.SUBSCRIBER
    label = "Experiment ROI"
    category = "experiment"
    inputs = []
    outputs = []
    subscribed_streams = []
    config_fields = []
