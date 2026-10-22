/* Sample inventory: the demo that "Load demo" adds in a browser. It is not part of the page and is never sent to a server.
   The page starts empty; this file is loaded only when the demo is asked for. Each call builds a fresh copy. */
window.NI_DEMO = function (syncTime) {
  let seq = 100, codeN = 0;
  const byName = n => objs.find(o => o.name === n);
  const LOCS = ['Zürich HQ / Serverraum UG','Zürich HQ / Büro 2.OG','Zürich HQ / Empfang','Zürich HQ / Lager','Bern / Büro'];
  const RACKS = [
    {id:'R-SRV', name:'ZH-SRV-RACK-01', loc:LOCS[0], units:42},
    {id:'R-2OG', name:'ZH-2OG-WALL-01', loc:LOCS[1], units:12},
    {id:'R-BE', name:'BE-WALL-01', loc:'Bern / Büro', units:6}
  ];
  const nextCode = () => 'INV-' + String(++codeN).padStart(4, '0');
  const F = (ref, seen) => ({sys:'Lansweeper', ref, seen});
  const O = (type, name, f) => ({id:'o'+(++seq), code:nextCode(), type, name, status:'active', feed:null, ovr:{}, ...f});
  const objs = [
    O('switch','SW-ZH-CORE-01',{model:'Cisco Catalyst C9300-48P',serial:'FOC2741X0AB',ip:'10.10.0.2',mac:'70:b3:17:4a:00:01',loc:LOCS[0],ports:48,pfx:'Gi1/0/',sfp:4,os:'IOS-XE 17.12.3',feed:F('1042','21.10.2026 05:58')}),
    O('switch','SW-ZH-2OG-01',{model:'HPE Aruba 2930F-24G-PoE+',serial:'SG21KZP0Q4',ip:'10.10.0.12',mac:'94:60:d5:11:2c:00',loc:LOCS[1],ports:24,pfx:'1/',sfp:4,os:'ArubaOS WC.16.11',feed:F('1043','21.10.2026 05:58')}),
    O('switch','SW-BE-01',{model:'HPE Aruba 2930F-24G-PoE+',serial:'SG21KZP1B7',ip:'10.20.0.2',mac:'94:60:d5:19:7e:00',loc:LOCS[4],ports:24,pfx:'1/',sfp:4,os:'ArubaOS WC.16.11',feed:F('1101','21.10.2026 05:59')}),
    O('patch','PP-ZH-SRV-01',{model:'Cat6A patch panel, 24 ports',serial:'PPZH0001',loc:LOCS[0],ports:24}),
    O('patch','PP-ZH-2OG-01',{model:'Cat6 patch panel, 24 ports',serial:'PPZH0002',loc:LOCS[1],ports:24}),
    O('server','SRV-ZH-HV01',{model:'Dell PowerEdge R750',serial:'7GXK2Q3',ip:'10.10.1.11',mac:'b0:7b:25:a1:10:01',loc:LOCS[0],os:'Windows Server 2022 Datacenter',cpu:'2× Xeon Silver 4314',ram:'512 GB',feed:F('2001','21.10.2026 05:41')}),
    O('server','SRV-ZH-HV02',{model:'Dell PowerEdge R750',serial:'7GXK2Q4',ip:'10.10.1.12',mac:'b0:7b:25:a1:10:02',loc:LOCS[0],os:'Windows Server 2022 Datacenter',cpu:'2× Xeon Silver 4314',ram:'512 GB',feed:F('2002','21.10.2026 05:41')}),
    O('server','SRV-ZH-FS01',{model:'HPE ProLiant DL380 Gen10',serial:'CZJ93104LM',ip:'10.10.1.20',mac:'98:f2:b3:2e:41:aa',loc:LOCS[0],os:'Windows Server 2019 Standard',feed:F('2003','21.10.2026 05:42')}),
    O('server','SRV-BE-DC01',{model:'Dell PowerEdge R450',serial:'3HLQ9R2',ip:'10.20.1.10',mac:'b0:7b:25:c4:08:11',loc:LOCS[4],os:'Windows Server 2022 Standard',feed:F('2050','21.10.2026 05:44')}),
    O('pc','ZH-PC-0142',{model:'HP EliteDesk 800 G9 Mini',serial:'CZC3217KQ1',ip:'10.10.20.42',mac:'64:4e:d7:3a:91:0c',loc:LOCS[1],user:'M. Keller',os:'Windows 11 Pro 23H2',feed:F('3142','21.10.2026 05:12')}),
    O('pc','ZH-PC-0143',{model:'HP EliteDesk 800 G9 Mini',serial:'CZC3217KQ7',ip:'10.10.20.43',mac:'64:4e:d7:3a:94:b2',loc:LOCS[1],user:'S. Brunner',os:'Windows 11 Pro 23H2',feed:F('3143','21.10.2026 05:13')}),
    O('pc','ZH-PC-0150',{model:'Lenovo ThinkCentre M70q Gen 4',serial:'MJ0K8T2X',ip:'10.10.20.50',mac:'8c:16:45:0e:77:31',loc:LOCS[2],user:'Empfang',os:'Windows 11 Pro 23H2',feed:F('3150','21.10.2026 05:20')}),
    O('pc','ZH-NB-0201',{model:'Lenovo ThinkPad T14 Gen 4',serial:'PF4R2K9D',ip:'10.10.30.117',mac:'a4:c3:f0:52:1b:e9',loc:LOCS[1],user:'L. Meier',os:'Windows 11 Pro 23H2',feed:F('3201','20.10.2026 17:48')}),
    O('pc','BE-PC-0031',{model:'HP EliteDesk 800 G6 Mini',serial:'CZC1094XRT',ip:'10.20.20.31',mac:'9c:7b:ef:44:02:8d',loc:LOCS[4],user:'R. Schmid',os:'Windows 10 Pro 22H2',feed:F('3531','21.10.2026 05:31')}),
    O('monitor','MON-0412',{model:'Dell P2422H 24"',serial:'CN0G7K2Y-FCC00',loc:LOCS[1],feed:F('3142-m1','21.10.2026 05:12')}),
    O('monitor','MON-0413',{model:'Dell P2422H 24"',serial:'CN0G7K2Y-FCC01',loc:LOCS[1],feed:F('3142-m2','21.10.2026 05:12')}),
    O('monitor','MON-0420',{model:'Dell U2723QE 27" 4K',serial:'CN0HH3MR-74261',loc:LOCS[1],feed:F('3143-m1','21.10.2026 05:13')}),
    O('monitor','MON-0431',{model:'Lenovo ThinkVision T24i-30',serial:'V30A8K2L',loc:LOCS[1],feed:F('3201-m1','20.10.2026 17:48')}),
    O('monitor','MON-0433',{model:'Dell P2422H 24"',serial:'CN0G7K2Y-FCC33',loc:LOCS[3],status:'stock'}),
    O('monitor','MON-0440',{model:'HP E24 G5',serial:'CNC2440TRL',loc:LOCS[4],feed:F('3531-m1','21.10.2026 05:31')}),
    O('sip','SIP-ZH-2101',{model:'Yealink T54W',serial:'801541E09A31',ip:'10.10.40.101',mac:'80:5e:c0:41:09:a3',loc:LOCS[1],user:'M. Keller',ext:'2101',fw:'96.86.0.70',feed:F('4101','21.10.2026 05:50')}),
    O('sip','SIP-ZH-2102',{model:'Yealink T54W',serial:'801541E09A55',ip:'10.10.40.102',mac:'80:5e:c0:41:09:a5',loc:LOCS[1],user:'S. Brunner',ext:'2102',fw:'96.86.0.70',feed:F('4102','21.10.2026 05:50')}),
    O('sip','SIP-ZH-2000',{model:'Yealink T58W Pro',serial:'801588E10B02',ip:'10.10.40.100',mac:'80:5e:c0:58:10:b0',loc:LOCS[2],user:'Empfang',ext:'2000',fw:'150.86.0.32',feed:F('4100','21.10.2026 05:50')}),
    O('sip','SIP-BE-3101',{model:'Snom D785',serial:'000413A8C5F2',ip:'10.20.40.101',mac:'00:04:13:a8:c5:f2',loc:LOCS[4],user:'R. Schmid',ext:'3101',fw:'10.1.159.12',feed:F('4301','21.10.2026 05:52')}),
    O('tablet','TAB-ZH-01',{model:'Apple iPad (10th gen) 64 GB',serial:'F9FXK2LQ0D',ip:'10.10.30.201',mac:'3c:22:fb:7a:10:4e',loc:LOCS[2],user:'Empfang (Check-in)',os:'iPadOS 18.6',feed:F('5001','21.10.2026 04:10')}),
    O('tablet','TAB-ZH-02',{model:'Samsung Galaxy Tab S9 FE',serial:'R52W40ABCDX',mac:'b4:ef:39:22:6c:01',loc:LOCS[3],user:'Aussendienst',os:'Android 14',status:'repair',feed:F('5002','02.10.2026 11:32')}),
    O('tablet','TAB-BE-01',{model:'Apple iPad Air (M2)',serial:'H7KQ2M0P11',ip:'10.20.30.201',mac:'3c:22:fb:9e:33:07',loc:LOCS[4],user:'R. Schmid',os:'iPadOS 18.6',feed:F('5050','20.10.2026 16:05')}),
    O('printer','PRN-ZH-2OG',{model:'HP LaserJet Enterprise M507dn',serial:'PHBQK18342',ip:'10.10.50.21',mac:'f8:b4:6a:0c:21:9e',loc:LOCS[1],feed:F('6001','21.10.2026 05:55')}),
    O('server','VM-ZH-DC01',{kind:'vm',model:'Windows Server 2022 Standard',os:'Windows Server 2022 Standard',ip:'10.10.1.5',mac:'00:50:56:a1:00:05',loc:LOCS[0],cpu:'4 vCPU',ram:'8 GB'}),
    O('server','VM-ZH-APP01',{kind:'vm',model:'Debian 12',os:'Debian 12',ip:'10.10.1.6',mac:'00:50:56:a1:00:06',loc:LOCS[0],cpu:'8 vCPU',ram:'32 GB'}),
    O('storage','NAS-ZH-2OG',{model:'Synology DS224+',serial:'SYN224A17', ip:'10.10.2.11', mac:'00:11:32:5c:0a:11', loc:LOCS[1], cap:'8 TB', proto:'SMB · NFS'}),
    O('storage','STO-ZH-01',{model:'QNAP TS-h1290FX',serial:'Q1290FX0042',ip:'10.10.2.10',mac:'24:5e:be:11:00:01',loc:LOCS[0],cap:'24 TB',proto:'iSCSI · NFS'}),
    O('firewall','FW-ZH-01',{model:'Fortinet FortiGate 60F',serial:'FGT60F0001',ip:'10.10.0.1',mac:'08:5b:0e:11:22:01',loc:LOCS[0],os:'FortiOS 7.4'}),
    O('firewall','FW-BE-01',{model:'Fortinet FortiGate 60F',serial:'FGT60F0002',ip:'10.20.0.1',mac:'08:5b:0e:11:22:02',loc:LOCS[4],os:'FortiOS 7.4'}),
    O('smartphone','PH-ZH-KELLER',{model:'Apple iPhone 15',serial:'DNQ4K2L7P9',loc:LOCS[1],user:'M. Keller',os:'iOS 18.6',mac:'a8:88:08:14:5c:21'}),
    O('smartphone','PH-BE-SCHMID',{model:'Samsung Galaxy S24',serial:'R5CX3ABC901',loc:LOCS[4],user:'R. Schmid',os:'Android 15',mac:'f4:7b:5e:90:12:0d'}),
    O('other','BEAMER-ZH-2OG',{model:'Epson EB-X51 projector',serial:'X5ABC24019',loc:LOCS[1],ip:'10.10.50.30',mac:'00:26:ab:3c:10:77'})
  ];
  /* Rack placement: u is the lowest unit the device occupies, h the height in units. Units count from the bottom. */
  const place = (name, rack, u, h = 1) => Object.assign(byName(name), {rack, u, h});
  place('SW-ZH-CORE-01','R-SRV',40); place('PP-ZH-SRV-01','R-SRV',38);
  place('SRV-ZH-HV01','R-SRV',34,2); place('SRV-ZH-HV02','R-SRV',32,2); place('SRV-ZH-FS01','R-SRV',28,2);
  place('SW-ZH-2OG-01','R-2OG',10); place('PP-ZH-2OG-01','R-2OG',8);
  Object.assign(byName('NAS-ZH-2OG'), {rack:'R-2OG', ontop:byName('SW-ZH-2OG-01').id});
  place('SW-BE-01','R-BE',6); place('SRV-BE-DC01','R-BE',4);
  place('STO-ZH-01','R-SRV',20,4);
  place('FW-ZH-01','R-SRV',42); place('FW-BE-01','R-BE',5);

  let rseq = 0;
  const rels = [];
  const R = (from, kind, to, port, vlan) => rels.push({id:'r'+(++rseq), from:byName(from).id, kind, to:byName(to).id, port:port ?? null, vlan:vlan ?? null});
  R('SW-ZH-2OG-01','uplink','SW-ZH-CORE-01',48);
  R('SW-ZH-CORE-01','downlink','SW-ZH-2OG-01',25);
  R('PP-ZH-SRV-01','connected','SW-ZH-CORE-01',20,'10 Server');
  R('SRV-ZH-HV01','patched','PP-ZH-SRV-01','P01','10 Server');
  R('SRV-ZH-HV02','patched','PP-ZH-SRV-01','P02','10 Server');
  R('SRV-ZH-FS01','patched','PP-ZH-SRV-01','P03','10 Server');
  R('SRV-BE-DC01','connected','SW-BE-01',1,'10 Server');
  R('SIP-ZH-2000','connected','SW-ZH-CORE-01',14,'40 Voice');
  R('ZH-PC-0150','connected','SIP-ZH-2000','PC port','20 Clients');
  R('PP-ZH-2OG-01','connected','SW-ZH-2OG-01',2,'trunk');
  R('SIP-ZH-2101','patched','PP-ZH-2OG-01','P01','40 Voice');
  R('ZH-PC-0142','connected','SIP-ZH-2101','PC port','20 Clients');
  R('SIP-ZH-2102','patched','PP-ZH-2OG-01','P02','40 Voice');
  R('ZH-PC-0143','connected','SIP-ZH-2102','PC port','20 Clients');
  R('PRN-ZH-2OG','connected','SW-ZH-2OG-01',21,'50 Print');
  R('MON-0412','attached','ZH-PC-0142','DP 1'); R('MON-0413','attached','ZH-PC-0142','DP 2');
  R('MON-0420','attached','ZH-PC-0143','USB-C');
  R('ZH-NB-0201','docked','MON-0431','USB-C');
  R('MON-0431','connected','SW-ZH-2OG-01',9,'20 Clients');
  R('SIP-BE-3101','connected','SW-BE-01',5,'40 Voice');
  R('BE-PC-0031','connected','SIP-BE-3101','PC port','20 Clients');
  R('MON-0440','attached','BE-PC-0031','DP 1');
  R('VM-ZH-DC01','hosted','SRV-ZH-HV01'); R('VM-ZH-APP01','hosted','SRV-ZH-HV02');
  R('STO-ZH-01','connected','SW-ZH-CORE-01',24,'10 Server');
  R('SW-ZH-CORE-01','uplink','FW-ZH-01','wan1','WAN'); R('SW-BE-01','uplink','FW-BE-01','wan1','WAN');
  R('SRV-ZH-HV01','connected','STO-ZH-01','iSCSI'); R('SRV-ZH-HV02','connected','STO-ZH-01','iSCSI');

  const history = {};
  const hist = (o, t, msg) => (history[o.id] ??= []).unshift({t, msg});
  objs.forEach(o => { if (o.feed) hist(o, '14.03.2025 09:12', 'Created by feed sync'); else hist(o, '02.09.2026 14:30', 'Created manually by v.ljuca'); });
  hist(byName('TAB-ZH-02'), '03.10.2026 10:15', 'Status changed In use → In repair by v.ljuca');
  byName('ZH-PC-0142').software = [{name:'Microsoft Office',version:'2024'},{name:'Google Chrome',version:'129'},{name:'Adobe Acrobat Reader',version:'24.3'}];
  byName('ZH-PC-0143').software = [{name:'Microsoft Office',version:'2021'},{name:'Google Chrome',version:'129'}];
  byName('ZH-NB-0201').software = [{name:'Microsoft Office',version:'2024'}];
  byName('SRV-ZH-HV01').software = [{name:'Hyper-V',version:'Server 2022'}];
  byName('SRV-ZH-HV02').software = [{name:'Hyper-V',version:'Server 2022'}];
  let USERS = [
    {login:'m.keller', name:'M. Keller', dept:'Finance', groups:['Finance'], source:'ldap', active:true},
    {login:'s.brunner', name:'S. Brunner', dept:'Sales', groups:['Sales'], source:'ldap', active:true},
    {login:'r.schmid', name:'R. Schmid', dept:'Operations', groups:['Bern'], source:'ldap', active:true},
    {login:'l.meier', name:'L. Meier', dept:'IT', groups:['IT'], source:'manual', active:true},
    {login:'', name:'Empfang', dept:'Reception', groups:[], source:'manual', active:true},
    {login:'', name:'Aussendienst', dept:'Sales', groups:[], source:'manual', active:true},
    {login:'', name:'Empfang (Check-in)', dept:'Reception', groups:[], source:'manual', active:true}
  ];
  USERS = USERS.map((u, i) => ({id:'u' + (i + 1), role: u.login === 'l.meier' ? 'admin' : 'viewer', ...u}));
  /* What the directory returns for the search base in the settings. Mock data for this mockup. */
  const LDAP_SAMPLE = [
    {login:'a.frei', name:'A. Frei', dept:'IT', groups:['IT']},
    {login:'m.keller', name:'M. Keller', dept:'Finance', groups:['Finance']},
    {login:'r.schmid', name:'R. Schmid', dept:'Sales', groups:['Sales']},
    {login:'k.weber', name:'K. Weber', dept:'Facility', groups:['Facility']}
  ];
  const ldap = {url:'ldaps://dc01.monsama.ch:636', bindDn:'CN=nobs-sync,OU=Service,DC=monsama,DC=ch', base:'OU=Users,DC=monsama,DC=ch',
    filter:'(&(objectClass=user)(!(objectCategory=computer)))', group:'CN=IT-Inventory,OU=Groups,DC=monsama,DC=ch',
    nightly:true, disable:true, last:null};
  const FEED_MAP = [
    ['Windows (workstation OS)','pc',412],['Windows (server OS)','server',38],['Linux','server',11],['VoIP phone','sip',96],
    ['iPad / iOS','tablet',22],['Android','tablet',9],['Monitor (from WMI)','monitor',503],['Switch','switch',14],['Printer','printer',27],['Patch panel','patch',0],['Router / Firewall','',6],['Unknown','',41]
  ];
  const FEED_EXISTING = [
    {name:'ZH-PC-0142', rec:{ip:'10.10.20.57'}},
    {name:'BE-PC-0031', rec:{os:'Windows 11 Pro 24H2'}},
    {name:'TAB-ZH-02', rec:{status:'active'}},
    {name:'MON-0433', ref:'3150-m2', rec:{}}
  ];
  const FEED_NEW = [
    {name:'SIP-ZH-2103', type:'sip', ref:'4103', seen:syncTime, rec:{model:'Yealink T54W', serial:'801541E09A77', ip:'10.10.40.103', mac:'80:5e:c0:41:09:a7', ext:'2103', fw:'96.86.0.70', user:'A. Frei', loc:LOCS[1]},
      rel:{kind:'patched', to:'PP-ZH-2OG-01', port:'P03', vlan:'40 Voice'}, detail:'Ext. 2103 · 10.10.40.103 · patched to PP-ZH-2OG-01 P03'},
    {name:'ZH-PC-0144', type:'pc', ref:'3144', seen:syncTime, rec:{model:'HP EliteDesk 800 G9 Mini', serial:'CZC3217KR2', ip:'10.10.20.44', mac:'64:4e:d7:3a:98:11', os:'Windows 11 Pro 23H2', user:'A. Frei', loc:LOCS[1]},
      rel:{kind:'connected', to:'SIP-ZH-2103', port:'PC port', vlan:'20 Clients'}, detail:'Windows 11 Pro · 10.10.20.44'},
    {name:'MON-0445', type:'monitor', ref:'3144-m1', seen:syncTime, rec:{model:'Dell P2423D 24"', serial:'CN0R7W1K-QDC12', loc:LOCS[1]},
      rel:{kind:'attached', to:'ZH-PC-0144', port:'DP 1', vlan:null}, detail:'Attached to ZH-PC-0144'}
  ];
  return {seq, codeN, rseq, locs: LOCS, racks: RACKS, users: USERS, objs, rels, history, ldap, ldapSample: LDAP_SAMPLE, feedMap: FEED_MAP, feedExisting: FEED_EXISTING, feedNew: FEED_NEW};
};
