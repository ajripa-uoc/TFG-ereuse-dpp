import json
import hashlib
import logging

from dmidecode import DMIParse
from json_repair import repair_json
from evidence.parse_details import get_lshw_child

from evidence.models import Annotation
from evidence.xapian import index
from dpp.api_dlt import register_device_dlt, register_passport_dlt
from utils.constants import CHASSIS_DH


logger = logging.getLogger('django')


def get_mac(lshw):
    try:
        if type(lshw) is dict:
            hw = lshw
        else:
            hw = json.loads(lshw)
    except json.decoder.JSONDecodeError:
        hw = json.loads(repair_json(lshw))

    nets = []
    get_lshw_child(hw, nets, 'network')

    nets_sorted = sorted(nets, key=lambda x: x['businfo'])

    if nets_sorted:
        mac = nets_sorted[0]['serial']
        logger.debug("The snapshot has the following MAC: %s" , mac)
        return mac



class Build:
    def __init__(self, evidence_json, user, check=False):
        self.json = evidence_json
        self.uuid = self.json['uuid']
        self.user = user
        self.hid = None
        self.chid = None
        self.phid = self.get_signature(self.json)
        self.generate_chids()

        if check:
            return

        self.index()
        self.create_annotations()
        self.register_device_dlt()

    def index(self):
        snap = json.dumps(self.json)
        index(self.user.institution, self.uuid, snap)

    def generate_chids(self):
        self.algorithms = {
            'hidalgo1': self.get_hid_14(),
        }

    def get_hid_14(self):
        if self.json.get("software") == "workbench-script":
            hid = self.get_hid(self.json)
        else:
            device = self.json['device']
            manufacturer = device.get("manufacturer", '')
            model = device.get("model", '')
            chassis = device.get("chassis", '')
            serial_number = device.get("serialNumber", '')
            sku = device.get("sku", '')
            hid = f"{manufacturer}{model}{chassis}{serial_number}{sku}"


        self.chid = hashlib.sha3_256(hid.encode()).hexdigest()
        return self.chid

    def create_annotations(self):
        annotation = Annotation.objects.filter(
                uuid=self.uuid,
                owner=self.user.institution,
                type=Annotation.Type.SYSTEM,
        )

        if annotation:
            txt = "Warning: Snapshot %s already registered (annotation exists)"
            logger.warning(txt, self.uuid)
            return

        for k, v in self.algorithms.items():
            Annotation.objects.create(
                uuid=self.uuid,
                owner=self.user.institution,
                user=self.user,
                type=Annotation.Type.SYSTEM,
                key=k,
                value=v
            )

    def get_chassis_dh(self):
        chassis = self.get_chassis()
        lower_type = chassis.lower()
        for k, v in CHASSIS_DH.items():
            if lower_type in v:
                return k
        return self.default

    def get_sku(self):
        return self.dmi.get("System")[0].get("SKU Number", "n/a").strip()

    def get_chassis(self):
        return self.dmi.get("Chassis")[0].get("Type", '_virtual')

    def get_hid(self, snapshot):
        dmidecode_raw = snapshot["data"]["dmidecode"]
        self.dmi = DMIParse(dmidecode_raw)

        manufacturer = self.dmi.manufacturer().strip()
        model = self.dmi.model().strip()
        chassis = self.get_chassis_dh()
        serial_number = self.dmi.serial_number()
        sku = self.get_sku()

        if not snapshot["data"].get('lshw'):
            return f"{manufacturer}{model}{chassis}{serial_number}{sku}"

        lshw = snapshot["data"]["lshw"]
        # mac = get_mac2(hwinfo_raw) or ""
        mac = get_mac(lshw) or ""
        if not mac:
            txt = "Could not retrieve MAC address in snapshot %s"
            logger.warning(txt, snapshot['uuid'])

        return f"{manufacturer}{model}{chassis}{serial_number}{sku}{mac}"
    
    def get_signature(self, doc):
        return hashlib.sha3_256(json.dumps(doc).encode()).hexdigest()

    def register_device_dlt(self):
        register_device_dlt(self.chid, self.phid, self.uuid, self.user)
        register_passport_dlt(self.chid, self.phid, self.uuid, self.user)