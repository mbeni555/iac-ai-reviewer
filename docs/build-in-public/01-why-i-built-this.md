# Why I built this

I have spent a lot of time in Terraform reviews where the useful sentence never gets written down.

Checkov or Trivy fails the job. The log says `CKV_AWS_53` or `KSV-0017`. The author of the pull request is often a product engineer who needed a bucket or a debug pod, not a person who has the check catalog memorized. They either suppress the check, or they ping whoever is on call for the platform team. Both outcomes throw away the scan. The finding was real. The next step was missing.

I wanted a review that still runs the scanners I already trust, and then does the part I do in a code review when I have time: say what can actually happen, say how bad it is in this system, and show the change. A public S3 ACL and a missing CPU request are not the same conversation. A privileged pod with `hostPID` and the host root mounted is not a medium "hardening" note just because one catalog says so.

Two constraints shaped the first version.

The first is that it has to work with no model key. A lot of teams will not put an API key in a new repo to find out if a bot is worth reading. The comment still has to show up, with the scanner's own words and a risk that does not depend on a vendor severity field. Open-source Checkov does not fill that field in unless you bring a commercial key. I learned that by running it, not by reading the marketing page, and the ranking map exists because of it.

The second is that the model does not get the file. It gets the line range, a little context, and the check metadata, after a redaction pass. I do not want a review bot to be the place a `.tfvars` password goes. That is a product decision I would rather write down now, in `SECURITY.md`, than explain after someone pastes a production module into a prompt.

This is also practice for the work I want to do next. The scanners are the DevSecOps part. The provider interface, the token cap, and the decision to fall back when the model errors are the engineering part. The ADRs, the roadmap, and the choice to keep the Action free while a later hosted view is optional are the leadership part. I would rather show those in a repository a stranger can run than describe them in a paragraph on a résumé.

The sample under `examples/` is intentionally bad: a public bucket, a security group open to `0.0.0.0/0`, and a privileged pod. The demo workflow scans that sample and stays green on purpose (`fail_on: none`) so the comment is the artifact. A real pipeline should set `fail_on: high`.

What I am not claiming in v0.1: that the model is right, that two scanners have been deduped, or that a comment replaces code scanning. Those are the next milestones, and they are written down so I cannot pretend this version already did them.
