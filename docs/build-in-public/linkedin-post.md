# Draft LinkedIn post

Edit the first person, delete anything that does not sound like you, and add the repository link before posting.

---

I got tired of pasting scanner output into pull requests and calling it a review.

Checkov and Trivy are good at the first half of the job. They point at a public S3 ACL, a security group open to the world, a privileged pod. They are bad at the second half, which is the sentence a product engineer can act on: what breaks in production, how bad it is, and the change to make. So the check gets suppressed, or it waits for whoever owns the platform that week.

I built a small open-source GitHub Action, IaC AI Reviewer, that runs those scanners on the Terraform and Kubernetes files in a pull request and then asks a model for that sentence. The risk is critical, high, medium, or low, with one line on why. The fix is a concrete change, not "consider hardening."

Two rules I did not want to compromise on:

It still works with no API key. You get the same comment, written from the scanner's own guidance. A tool that only runs after someone approves a secret is a tool most teams will never try.

The model does not get the file. It gets the flagged lines, a little context, and the check id, with secret-shaped strings redacted first. A review bot is a terrible place to send a whole module.

The Action is the free, open-source piece. A hosted view for a small team, where the findings accumulate and the policy is shared, is a later milestone. I want the review to be useful before any of that exists.

If you review infrastructure changes and your queue is mostly unexplained check ids, I would like to hear which finding you still have to translate by hand.
