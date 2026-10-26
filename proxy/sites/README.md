One file per service, named <service>.caddy. NOBS Inventory writes inventory.caddy from NI_HOST in its .env
(deploy-nobs.sh and update.sh do it); other services add their own. After a change: docker restart nobs-proxy
