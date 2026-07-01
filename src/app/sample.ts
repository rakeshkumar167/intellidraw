export const SAMPLE_DSL = `# IntelliDraw — describe your architecture, then press Render.
# component <id> [type=service|database|cache|queue|external|lambda] [label="..."]
# edges:  A -> B [: label]     bidirectional:  A <-> B

component Web type=external label="Web Client"
component Mobile type=external label="Mobile App"
component API type=service label="API Gateway"

group Core label="Core Services" {
  component UserService type=service label="User Service"
  component OrderService type=service label="Order Service"
  component PaymentFn type=lambda label="Payment Fn"
}

component Redis type=cache
component Aurora type=database label="Aurora DB"
component Kafka type=queue label="Kafka Bus"
component Search type=service

Web -> API : HTTPS
Mobile -> API : HTTPS
API -> UserService : REST
API -> OrderService : REST
UserService <-> Redis : session
UserService -> Aurora
OrderService -> Aurora
OrderService -> PaymentFn : invoke
OrderService -> Kafka : events
Kafka -> Search : index
Kafka -> Notifier
`;
