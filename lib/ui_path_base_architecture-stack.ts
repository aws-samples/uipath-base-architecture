//SPDX-FileCopyrightText: Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
//
//SPDX-License-Identifier: MIT-0

import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as rds from '@aws-cdk/aws-rds';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import { InstanceClass } from '@aws-cdk/aws-ec2';
import { StorageType } from '@aws-cdk/aws-rds';

export class UiPathBaseArchitectureStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


          const prodvpc = new ec2.Vpc(this, 'prodvpc', {
            vpnGateway: false,
            //vpnConnections: , //here we can add connection configuration
            cidr: "10.0.0.0/16",
            //maxAzs: 3,
            subnetConfiguration: [
             {
               cidrMask: 24,
               name: 'Studio',
               subnetType: ec2.SubnetType.PUBLIC,
             },
             {
               cidrMask: 24,
               name: 'windows orchestrator',
               subnetType: ec2.SubnetType.ISOLATED,
             },
             {
               cidrMask: 24,
               name: 'HAA orchestrator',
               subnetType: ec2.SubnetType.ISOLATED,
             },
             {
               cidrMask: 24,
               name: 'RDS SQL Server',
               subnetType: ec2.SubnetType.ISOLATED,
             }
            ]
          });



          const stdsub = prodvpc.selectSubnets({subnetGroupName: 'Studio'}) ;
          const haasub = prodvpc.selectSubnets({subnetGroupName: 'HAA orchestrator'}) ;
          const winsub = prodvpc.selectSubnets({subnetGroupName: 'windows orchestrator'});
          const rdssub = prodvpc.selectSubnets({subnetGroupName: 'RDS SQL Server'});

          const winsubcidr = winsub.subnets[0].ipv4CidrBlock
          const stdsubcidr = stdsub.subnets[0].ipv4CidrBlock

          // e.g.: subnet-xxxxxxxxx
          //const haasubIds = haasub.subnetIds;

          // As objects for use elsewhere in your app
          //const haasub = haasub.subnets;

          //if you need to add tags
          //Tag.add(prodvpc, 'Name', 'Production VPC');



          //In case you want to start an instance directly
          // const iisinstance = new Instance(this, 'OrchestratorIIS', {
          //   vpc: prodvpc,
          //   instanceType:  ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
          //   instanceName: 'OrchestratorIIS',
          //   machineImage: new ec2.AmazonLinuxImage(),
          //   keyName: 'EC2Keypair',
          //   vpcSubnets: winsub //ec2.SubnetSelection({subnet_type=ec2.SubnetType('PUBLIC')})
          // });

          //const mycommand = "commands you want to run at EC2 startup";



          const stdsg = new ec2.SecurityGroup(this, 'StudioSecurityGroup', {
            vpc: prodvpc,
            description: 'Allow outbound traffic from ec2 instances',
            allowAllOutbound: true

          });
          stdsg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'allow http access from anyIpv4'); //add the ports you need

          //use this to connect to studio instances from internet, but restrict access to your ip
          stdsg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3389), 'allow rdp access from anyIpv4'); //add the ports you need

          const stdasg = new autoscaling.AutoScalingGroup(this, 'Studio-ASG', {
            autoScalingGroupName: "Studio-ASG",
            vpc: prodvpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            allowAllOutbound: true,
            machineImage:  ec2.MachineImage.latestWindows(ec2.WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),//WindowsImage.latestWindows('WINDOWS_SERVER_2019_ENGLISH_FULL_BASE'), //new machineImage.latestWindows('WINDOWS_SERVER_2019_ENGLISH_FULL_BASE'), //just an example, better to use ami ID, once created
            keyName: 'MilanKP', //use your keypair name
            vpcSubnets: stdsub,
            minCapacity: 1,
            desiredCapacity: 1,
            maxCapacity: 4,
            securityGroup: stdsg
            //userData: mycommand
          });

          const workerUtilizationMetric = new cloudwatch.Metric({
              namespace: 'MyService',
              metricName: 'WorkerUtilization'
          });

          stdasg.scaleOnMetric('ScaleToCPU', {
            metric: workerUtilizationMetric,
            scalingSteps: [
              { upper: 10, change: -1 }, //less than 10% reduce by -1
              { lower: 60, change: +1 }, //more than 60% increase by +1
              { lower: 80, change: +2 },
            ],

            // Change this to AdjustmentType.PERCENT_CHANGE_IN_CAPACITY to interpret the
            // 'change' numbers before as percentages instead of capacity counts.
            adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
          });



          const winsg = new ec2.SecurityGroup(this, 'WinSecurityGroup', {
            vpc: prodvpc,
            description: 'Allow outbound traffic from winasg ec2 instances',
            allowAllOutbound: true
          });

          //required to use NLB from studio instances
          winsg.addIngressRule(ec2.Peer.ipv4(stdsubcidr), ec2.Port.tcp(80), 'allow http access from Studio cidr');

          winsg.addIngressRule(stdsg, ec2.Port.tcp(80), 'allow DIRECT (no NLB) http access from studio instances'); //add the ports you need
          winsg.addIngressRule(stdsg, ec2.Port.tcp(3389), 'allow DIRECT (no NLB) rdp access from studio instances'); //add the ports you need


          const winasg = new autoscaling.AutoScalingGroup(this, 'WinASG', {
            autoScalingGroupName: "WinASG",
            vpc: prodvpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            allowAllOutbound: true,
            machineImage:  ec2.MachineImage.latestWindows(ec2.WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),//WindowsImage.latestWindows('WINDOWS_SERVER_2019_ENGLISH_FULL_BASE'), //new machineImage.latestWindows('WINDOWS_SERVER_2019_ENGLISH_FULL_BASE'), //just an example, better to use ami ID, once created
            keyName: 'MilanKP', //use your keypair name
            vpcSubnets: winsub,
            minCapacity: 1,
            desiredCapacity: 1,
            maxCapacity: 4,
            securityGroup: winsg
            //userData: mycommand
          });

          winasg.scaleOnCpuUtilization('KeepSpareCPU', {
            targetUtilizationPercent: 60
          });

          // this NLB points to windows server autoscaling group
          const lb = new elbv2.NetworkLoadBalancer(this, 'Win Orchestrator NLB', {
            vpc: prodvpc,
            crossZoneEnabled: true,
            internetFacing: false,
            loadBalancerName: 'OrchestratorNLB',
            vpcSubnets: winsub
          });

          const listener = lb.addListener('Listener', {
            port: 80,
          });

          listener.addTargets('Target', {
            targetGroupName: 'WinASG-Target-Group',
            port: 80,
            targets: [winasg]
          });


          const haaasg = new autoscaling.AutoScalingGroup(this, 'HAA-AustoScalingGgroup', {
            autoScalingGroupName: "HAA-ASG",
            vpc: prodvpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            allowAllOutbound: true,
            machineImage:  ec2.MachineImage.latestAmazonLinux({
              generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX,
              edition: ec2.AmazonLinuxEdition.STANDARD,
              virtualization: ec2.AmazonLinuxVirt.HVM,
              storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
              cpuType: ec2.AmazonLinuxCpuType.X86_64
            }), //just an example, better to use ami ID, once created
            keyName: 'MilanKP', //use your keypair name
            vpcSubnets: haasub,
            minCapacity: 1,
            desiredCapacity: 1,
            maxCapacity: 4
          });

          haaasg.connections.allowFrom( winasg, ec2.Port.tcp(80) );


          const mySQLRDSInstance = new rds.DatabaseInstance(this, 'mssql-rds-instance', {
            engine: rds.DatabaseInstanceEngine.SQL_SERVER_EE,
            instanceType: ec2.InstanceType.of(InstanceClass.T3, ec2.InstanceSize.XLARGE),
            vpc: prodvpc,
            vpcPlacement: rdssub, //{subnetType: SubnetType.ISOLATED},
            storageEncrypted: false,
            multiAz: true,
            autoMinorVersionUpgrade: false,
            allocatedStorage: 25,
            storageType: StorageType.GP2,
            deletionProtection: false,
            licenseModel:  rds.LicenseModel.LICENSE_INCLUDED,
            //databaseName: "mydbname", //must be null for sql server EE
            port: 1433
          });

          mySQLRDSInstance.connections.allowFrom( winasg, ec2.Port.tcp(1433) );


  }
}
